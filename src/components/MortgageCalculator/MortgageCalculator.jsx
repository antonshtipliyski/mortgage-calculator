import { useMemo, useState } from "react";

export default function MortgageCalculator() {
  const [principal, setPrincipal] = useState(500000);
  const [annualRate, setAnnualRate] = useState(5.0);
  const [years, setYears] = useState(25);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);
  const [currency, setCurrency] = useState("CAD");

  const [limitBasePrincipal, setLimitBasePrincipal] = useState(500000);
  const [prepaymentLimitValue, setPrepaymentLimitValue] = useState(15);
  const [prepaymentLimitType, setPrepaymentLimitType] = useState("percentage");

  const [prepayments, setPrepayments] = useState([]);
  const [newPrepayType, setNewPrepayType] = useState("monthly");
  const [newPrepayAmount, setNewPrepayAmount] = useState(500);
  const [newPrepayStartMonth, setNewPrepayStartMonth] = useState(1);
  const [recalcMode, setRecalcMode] = useState("reduce-amortization");

  const fmt = (v) =>
    v === null || Number.isNaN(v)
      ? "-"
      : v.toLocaleString(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        });

  const baseline = useMemo(() => {
    const P = Number(principal) || 0;
    const r = Number(annualRate) / 100 || 0;
    const n = Math.max(1, Math.round(Number(years) * 12));
    const monthlyRate = r / 12;

    let payment;
    if (monthlyRate === 0) {
      payment = P / n;
    } else {
      payment =
        (P * (monthlyRate * Math.pow(1 + monthlyRate, n))) /
        (Math.pow(1 + monthlyRate, n) - 1);
    }

    const rows = [];
    let balance = P;
    for (let i = 1; i <= n; i++) {
      const interest = balance * monthlyRate;
      let principalPaid = payment - interest;
      if (i === n) principalPaid = balance;
      const endBalance = Math.max(0, balance - principalPaid);
      rows.push({
        month: i,
        beginBalance: balance,
        interest,
        scheduledPayment: payment,
        extra: 0,
        payment: payment,
        principalPaid,
        endBalance,
      });
      balance = endBalance;
    }

    const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
    const totalPaid = rows.reduce((s, r) => s + r.payment, 0);

    return {
      payment,
      schedule: rows,
      totals: { totalInterest, totalPaid, totalPrincipal: P, months: n },
    };
  }, [principal, annualRate, years]);

  const annualLimit = useMemo(() => {
    const value = Number(prepaymentLimitValue) || 0;
    if (prepaymentLimitType === "percentage") {
      const base = Number(limitBasePrincipal) || Number(principal) || 0;
      return base * (value / 100);
    } else {
      return value;
    }
  }, [
    prepaymentLimitType,
    prepaymentLimitValue,
    limitBasePrincipal,
    principal,
  ]);

  const extrasForMonth = (monthIndex, prepaymentsList = prepayments) => {
    let extra = 0;
    for (const p of prepaymentsList) {
      if (!p || Number(p.amount) <= 0) continue;
      if (p.type === "one-time" && p.startMonth === monthIndex)
        extra += p.amount;
      else if (p.type === "monthly" && p.startMonth <= monthIndex)
        extra += p.amount;
      else if (p.type === "yearly" && p.startMonth <= monthIndex) {
        if ((monthIndex - p.startMonth) % 12 === 0) extra += p.amount;
      }
    }
    return extra;
  };

  const validatePrepayments = (list) => {
    const nMonths = Math.max(1, Math.round(Number(years) * 12));
    const blocks = Math.ceil(nMonths / 12);
    const errors = [];
    for (let b = 0; b < blocks; b++) {
      const start = b * 12 + 1;
      const end = Math.min(nMonths, (b + 1) * 12);
      let blockSum = 0;
      for (let m = start; m <= end; m++) {
        blockSum += extrasForMonth(m, list);
      }
      if (blockSum - 0.0001 > annualLimit) {
        errors.push({
          block: b + 1,
          start,
          end,
          total: blockSum,
          limit: annualLimit,
        });
      }
    }
    return errors;
  };

  const adjustedResult = useMemo(() => {
    const P = Number(principal) || 0;
    const r = Number(annualRate) / 100 || 0;
    const nOrig = Math.max(1, Math.round(Number(years) * 12));
    const monthlyRate = r / 12;

    let basePayment;
    if (monthlyRate === 0) basePayment = P / nOrig;
    else
      basePayment =
        (P * (monthlyRate * Math.pow(1 + monthlyRate, nOrig))) /
        (Math.pow(1 + monthlyRate, nOrig) - 1);

    const rows = [];
    let balance = P;
    let month = 1;

    while (balance > 0.00001 && month <= Math.max(nOrig * 5, 1000)) {
      const remainingMonths = Math.max(1, nOrig - (month - 1));
      let scheduledPayment;
      if (recalcMode === "reduce-payment") {
        if (monthlyRate === 0) scheduledPayment = balance / remainingMonths;
        else
          scheduledPayment =
            (balance *
              (monthlyRate * Math.pow(1 + monthlyRate, remainingMonths))) /
            (Math.pow(1 + monthlyRate, remainingMonths) - 1);
      } else {
        scheduledPayment = basePayment;
      }

      const interest = balance * monthlyRate;
      let nominalPrincipal = scheduledPayment - interest;
      if (nominalPrincipal < 0) nominalPrincipal = 0;

      if (nominalPrincipal >= balance) {
        const actualPayment = balance + interest;
        rows.push({
          month,
          beginBalance: balance,
          interest,
          scheduledPayment,
          extra: 0,
          payment: actualPayment,
          principalPaid: balance,
          endBalance: 0,
        });
        balance = 0;
        month += 1;
        break;
      }

      let endBalanceAfterScheduled = Math.max(0, balance - nominalPrincipal);

      const extra = extrasForMonth(month, prepayments);
      let appliedExtra = 0;
      if (extra > 0) {
        appliedExtra = Math.min(extra, endBalanceAfterScheduled);
        endBalanceAfterScheduled = Math.max(
          0,
          endBalanceAfterScheduled - appliedExtra
        );
      }

      const actualPayment = scheduledPayment + appliedExtra;
      const principalPaid = nominalPrincipal + appliedExtra;

      rows.push({
        month,
        beginBalance: balance,
        interest,
        scheduledPayment,
        extra: appliedExtra,
        payment: actualPayment,
        principalPaid,
        endBalance: endBalanceAfterScheduled,
      });

      balance = endBalanceAfterScheduled;
      month += 1;
    }

    const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
    const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
    const totalPrincipal = Math.max(0, totalPaid - totalInterest);
    const months = rows.length;

    return {
      initialPayment: basePayment,
      paymentAfterRecalc: rows.length ? rows[0].payment : basePayment,
      schedule: rows,
      totals: { totalInterest, totalPaid, totalPrincipal, months },
    };
  }, [principal, annualRate, years, prepayments, recalcMode]);

  const baselineTotals = baseline.totals;
  const adjustedTotals = adjustedResult.totals;

  const interestSavings = Math.max(
    0,
    baselineTotals.totalInterest - adjustedTotals.totalInterest
  );
  const monthsSaved = Math.max(
    0,
    baselineTotals.months - adjustedTotals.months
  );

  const totalPages = Math.max(
    1,
    Math.ceil(adjustedResult.schedule.length / rowsPerPage)
  );
  if (currentPage > totalPages) setCurrentPage(totalPages);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = adjustedResult.schedule.slice(
    startIndex,
    startIndex + rowsPerPage
  );

  const downloadCSV = () => {
    const header = [
      "Month",
      "Begin Balance",
      "Interest",
      "Scheduled Payment",
      "Extra",
      "Payment",
      "Principal Paid",
      "End Balance",
    ];
    const lines = [header.join(",")];
    adjustedResult.schedule.forEach((r) => {
      lines.push(
        [
          r.month,
          r.beginBalance.toFixed(2),
          r.interest.toFixed(2),
          r.scheduledPayment.toFixed(2),
          (r.extra || 0).toFixed(2),
          r.payment.toFixed(2),
          r.principalPaid.toFixed(2),
          r.endBalance.toFixed(2),
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mortgage_schedule_${principal}_${years}y.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addPrepayment = () => {
    const amount = Number(newPrepayAmount) || 0;
    const start = Math.max(1, Math.floor(Number(newPrepayStartMonth) || 1));
    if (amount <= 0) return alert("Enter a positive prepayment amount.");
    const id = Date.now() + Math.random();
    const candidate = [
      ...prepayments,
      { id, type: newPrepayType, amount, startMonth: start },
    ];

    const errs = validatePrepayments(candidate);
    if (errs.length) {
      const e = errs[0];
      return alert(
        `This prepayment would exceed the annual limit of ${fmt(
          annualLimit
        )} for months ${e.start}-${e.end}. Total in that block would be ${fmt(
          e.total
        )}.`
      );
    }

    setPrepayments(candidate);
    setNewPrepayAmount(500);
    setNewPrepayStartMonth(1);
    setLimitBasePrincipal((op) => (op ? op : principal));
  };

  const removePrepayment = (id) => {
    setPrepayments((p) => p.filter((x) => x.id !== id));
  };

  const clearAllPrepayments = () => {
    if (!confirm("Clear all prepayments?")) return;
    setPrepayments([]);
  };

  const prepayValidationErrors = validatePrepayments(prepayments);

  const onRowsPerPageChange = (n) => {
    setRowsPerPage(n);
    setCurrentPage(1);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 sm:px-8 sm:py-10">
      <div className="flex justify-between items-start gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Mortgage Calculator</h1>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-sm">Currency:</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="p-1 border rounded"
            >
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <label className="flex flex-col">
          <span className="text-sm font-medium truncate">
            Loan amount (Principal)
          </span>
          <input
            type="number"
            value={principal}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setPrincipal(v);
              setLimitBasePrincipal((op) => (op ? op : v));
            }}
            className="mt-1 p-2 border rounded"
          />
        </label>

        <label className="flex flex-col">
          <span className="text-sm font-medium truncate">
            Interest rate (% annual)
          </span>
          <input
            type="number"
            step="0.01"
            value={annualRate}
            onChange={(e) => setAnnualRate(Number(e.target.value))}
            className="mt-1 p-2 border rounded"
          />
        </label>

        <label className="flex flex-col">
          <span className="text-sm font-medium truncate">Term (years)</span>
          <input
            type="number"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="mt-1 p-2 border rounded"
          />
        </label>

        <label className="flex flex-col">
          <span
            className="text-sm font-medium truncate truncate"
            title="Base principal (for % limit)"
          >
            Base principal (for % limit)
          </span>
          <input
            type="number"
            value={limitBasePrincipal}
            onChange={(e) => setLimitBasePrincipal(Number(e.target.value))}
            className="mt-1 p-2 border rounded"
            title="Original borrowed amount used to compute the annual prepayment limit when set by percentage."
            disabled={prepaymentLimitType === "amount"}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-sm font-medium truncate mb-1">
            Annual Prepayment Limit {"(%)"}
          </span>
          <input
            type="number"
            step={prepaymentLimitType === "percentage" ? "0.01" : "1"}
            value={prepaymentLimitValue}
            onChange={(e) => setPrepaymentLimitValue(Number(e.target.value))}
            className="p-2 border rounded"
            placeholder={
              prepaymentLimitType === "percentage" ? "e.g., 15" : "e.g., 50000"
            }
            title={`Enter the annual prepayment limit as a ${
              prepaymentLimitType === "percentage"
                ? "percentage (%)"
                : "fixed amount"
            }`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 dark:bg-gray-700 shadow-sm rounded-xl p-6 text-center">
          <div className="text-sm text-gray-400">Baseline monthly payment</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {fmt(baseline.payment)}
          </div>
          <div className="text-xs text-gray-400 mt-1">(no prepayments)</div>
        </div>

        <div className="bg-gray-800 dark:bg-gray-700 shadow-sm rounded-xl p-6 text-center">
          <div className="text-sm text-gray-400">
            Adjusted payment (month 1)
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {fmt(adjustedResult.paymentAfterRecalc)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {recalcMode === "reduce-amortization"
              ? "Payment kept same; loan will end earlier"
              : "Payment re-amortized to keep term"}
          </div>
        </div>

        <div className="bg-gray-800 dark:bg-gray-700 shadow-sm rounded-xl p-6 text-center">
          <div className="text-sm text-gray-400">Annual prepayment limit</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {fmt(annualLimit)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            max per 12-month block
          </div>
        </div>
      </div>

      <div className="mb-6 border rounded p-4">
        <div className="flex flex-col gap-2 mb-3 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-medium">Prepayments</div>
          <div className="flex items-start gap-2 flex-col md:flex-row md:items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={recalcMode === "reduce-amortization"}
                onChange={() => setRecalcMode("reduce-amortization")}
              />
              Reduce amortization
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={recalcMode === "reduce-payment"}
                onChange={() => setRecalcMode("reduce-payment")}
              />
              Reduce payment
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <label className="flex flex-col md:col-span-2">
            <span className="text-sm">Type</span>
            <select
              value={newPrepayType}
              onChange={(e) => setNewPrepayType(e.target.value)}
              className="mt-1 p-2 border rounded h-[42px]"
            >
              <option value="one-time">One-time</option>
              <option value="monthly">Monthly (recurring)</option>
              <option value="yearly">Yearly (recurring)</option>
            </select>
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Amount</span>
            <input
              type="number"
              min="1"
              value={newPrepayAmount}
              onChange={(e) => setNewPrepayAmount(Number(e.target.value))}
              className="mt-1 p-2 border rounded"
            />
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Start month (1 = first payment)</span>
            <input
              type="number"
              min="1"
              value={newPrepayStartMonth}
              onChange={(e) => setNewPrepayStartMonth(Number(e.target.value))}
              className="mt-1 p-2 border rounded"
            />
          </label>

          <div className="md:col-span-2 flex items-center gap-2 justify-end">
            <button
              onClick={addPrepayment}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Prepayment
            </button>
            <button
              onClick={clearAllPrepayments}
              className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              Clear All
            </button>
          </div>
        </div>

        {prepayValidationErrors.length > 0 && (
          <div className="mt-3 text-yellow-400">
            Warning: Some 12-month blocks exceed the annual limit of{" "}
            {fmt(annualLimit)}:
            <ul className="list-disc ml-6">
              {prepayValidationErrors.map((e) => (
                <li key={e.block}>
                  Block {e.block} (months {e.start}–{e.end}): total{" "}
                  {fmt(e.total)}
                </li>
              ))}
            </ul>
            Remove or lower prepayments to satisfy the limit.
          </div>
        )}

        <div className="mt-4">
          <div className="text-sm font-medium truncate mb-2">
            Active prepayments
          </div>
          {prepayments.length === 0 ? (
            <div className="text-sm text-gray-400">No prepayments added</div>
          ) : (
            <div className="space-y-2">
              {prepayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-gray-800 p-2 rounded"
                >
                  <div className="text-sm">
                    <strong>{p.type}</strong> • {fmt(p.amount)} • starts month{" "}
                    {p.startMonth}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removePrepayment(p.id)}
                      className="px-2 py-1 bg-red-600 text-white rounded"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid md:grid-cols-3 gap-4">
        <div className="p-4 border rounded bg-white/5">
          <div className="text-sm text-gray-300">Baseline total interest</div>
          <div className="mt-1 font-semibold text-xl">
            {fmt(baselineTotals.totalInterest)}
          </div>
          <div className="text-xs text-gray-400">No prepayments</div>
        </div>

        <div className="p-4 border rounded bg-white/5">
          <div className="text-sm text-gray-300">Adjusted total interest</div>
          <div className="mt-1 font-semibold text-xl">
            {fmt(adjustedTotals.totalInterest)}
          </div>
          <div className="text-xs text-gray-400">With prepayments</div>
        </div>

        <div className="p-4 border rounded bg-white/5">
          <div className="text-sm text-gray-300">Interest savings</div>
          <div className="mt-1 font-semibold text-xl">
            {fmt(interestSavings)}
          </div>
          <div className="text-xs text-gray-400">
            Months saved: <strong>{monthsSaved}</strong>
          </div>
        </div>
      </div>
      <div className="mb-6 grid md:grid-cols-2 gap-4">
        <div className="p-4 border rounded bg-white/5">
          <div className="text-sm text-gray-300">Adjusted months to payoff</div>
          <div className="mt-1 font-semibold text-xl">
            {adjustedTotals.months} months
          </div>
          <div className="text-xs text-gray-400">
            <strong>
              {"("}
              {Math.floor(adjustedTotals.months / 12)} years{" "}
              {adjustedTotals.months % 12} months{")"}
            </strong>
          </div>
        </div>
        <div className="p-4 border rounded bg-white/5">
          <div className="text-sm text-gray-300">Total paid</div>
          <div className="mt-1 font-semibold text-xl">
            {fmt(adjustedTotals.totalPaid)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <label className="flex items-center gap-2">
            <span className="text-sm">Rows per page</span>
            <select
              value={rowsPerPage}
              onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
              className="w-20 p-1 border rounded bg-gray-700 text-white"
            >
              {[12, 24, 36, 48, 60].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className={`px-3 py-1 rounded font-medium ${
                currentPage === 1
                  ? "bg-gray-500 text-gray-300"
                  : "bg-blue-600 text-white"
              }`}
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-3 py-1 rounded font-medium ${
                currentPage === 1
                  ? "bg-gray-500 text-gray-300"
                  : "bg-blue-600 text-white"
              }`}
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`px-3 py-1 rounded font-medium ${
                currentPage === totalPages
                  ? "bg-gray-500 text-gray-300"
                  : "bg-blue-600 text-white"
              }`}
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1 rounded font-medium ${
                currentPage === totalPages
                  ? "bg-gray-500 text-gray-300"
                  : "bg-blue-600 text-white"
              }`}
            >
              Last
            </button>
          </div>

          <div className="ml-4 text-sm text-gray-300">
            Page {currentPage} of {totalPages}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={downloadCSV}
            className="px-3 py-1 border rounded bg-gray-700 text-white hover:bg-gray-600"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full table-auto">
          <thead className="bg-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Month</th>
              <th className="px-3 py-2 text-right">Begin</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Scheduled</th>
              <th className="px-3 py-2 text-right">Extra</th>
              <th className="px-3 py-2 text-right">Payment</th>
              <th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">End</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((r) => (
              <tr key={r.month} className="border-t hover:bg-gray-500">
                <td className="px-3 py-2">{r.month}</td>
                <td className="px-3 py-2 text-right">{fmt(r.beginBalance)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.interest)}</td>
                <td className="px-3 py-2 text-right">
                  {fmt(r.scheduledPayment)}
                </td>
                <td className="px-3 py-2 text-right">{fmt(r.extra || 0)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.payment)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.principalPaid)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.endBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
