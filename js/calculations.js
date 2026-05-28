const Calculations = {
    calculateMaturity: (principal, rate, months, compoundingFreq) => {
        principal = parseFloat(principal);
        rate = parseFloat(rate) / 100;
        months = parseInt(months);
        compoundingFreq = parseInt(compoundingFreq);

        let maturityAmount;
        let interestEarned;

        if (compoundingFreq === 0) {
            // Simple Interest: P * r * t
            interestEarned = principal * rate * (months / 12);
            maturityAmount = principal + interestEarned;
        } else {
            // Compound Interest: P * (1 + r/n)^(nt)
            const n = compoundingFreq; // times per year
            const t = months / 12; // years
            maturityAmount = principal * Math.pow((1 + rate / n), n * t);
            interestEarned = maturityAmount - principal;
        }

        return {
            maturityAmount: Math.round(maturityAmount * 100) / 100,
            interestEarned: Math.round(interestEarned * 100) / 100
        };
    },

    calculateRD: (installment, rate, months, startDateStr) => {
        // We simulate a perfect payment schedule to estimate maturity
        if (!startDateStr) {
            // Fallback for missing start date in older calculations
            let d = new Date();
            startDateStr = d.toISOString().split('T')[0];
        }
        
        let simDeposit = {
            rate: rate,
            startDate: startDateStr,
            maturityDate: Calculations.getMaturityDate(startDateStr, months).toISOString().split('T')[0],
            transactions: []
        };
        
        let current = new Date(startDateStr);
        for(let i=0; i<months; i++) {
            simDeposit.transactions.push({
                date: new Date(current).toISOString().split('T')[0],
                amount: parseFloat(installment)
            });
            current.setMonth(current.getMonth() + 1);
        }

        // Project till maturity
        const result = Calculations.generateRDLedger(simDeposit, new Date(simDeposit.maturityDate));
        return {
            maturityAmount: result.finalBalance,
            interestEarned: result.totalInterest
        };
    },

    generateRDLedger: (deposit, toDate) => {
        // deposit expected to have: startDate, maturityDate, rate, transactions: [{date, amount}]
        const ledger = [];
        const ratePerDay = (parseFloat(deposit.rate) / 100) / 365;
        
        const startDate = new Date(deposit.startDate + "T00:00:00");
        const maturityDate = new Date(deposit.maturityDate + "T23:59:59");
        let endDate = toDate ? new Date(toDate.setHours(23, 59, 59)) : new Date();
        
        if (endDate > maturityDate) endDate = maturityDate; // cap at maturity
        
        let txs = deposit.transactions || [];
        let sortedTxs = [...txs].sort((a,b) => new Date(a.date) - new Date(b.date));
        
        let events = [];
        sortedTxs.forEach(tx => events.push({type: 'tx', date: new Date(tx.date + "T00:00:00"), amount: tx.amount}));
        
        let quarterEnds = [];
        let currentMonth = startDate.getMonth();
        let currentYear = startDate.getFullYear();
        let currentQEnd = new Date(currentYear, currentMonth < 3 ? 3 : currentMonth < 6 ? 6 : currentMonth < 9 ? 9 : 12, 0); 
        
        while (currentQEnd <= endDate) {
            if (currentQEnd >= startDate) {
                events.push({type: 'q-end', date: new Date(currentQEnd.getFullYear(), currentQEnd.getMonth(), currentQEnd.getDate(), 23, 59, 0)});
            }
            currentQEnd = new Date(currentQEnd.getFullYear(), currentQEnd.getMonth() + 4, 0);
        }
        
        events.push({type: 'end', date: endDate});
        events.sort((a, b) => a.date - b.date);

        let balance = 0;
        let accruedInterest = 0;
        let lastDate = startDate;
        
        events.forEach(evt => {
            if (evt.date > lastDate) {
                const days = Math.floor((evt.date - lastDate) / (1000 * 60 * 60 * 24));
                accruedInterest += balance * ratePerDay * days;
                lastDate = evt.date;
            }

            if (evt.type === 'tx') {
                balance += evt.amount;
                ledger.push({
                    date: evt.date.toISOString().split('T')[0],
                    particulars: 'Installment Received',
                    debit: 0,
                    credit: evt.amount,
                    balance: balance,
                    isInterest: false
                });
            } else if (evt.type === 'q-end' || (evt.type === 'end' && evt.date.getTime() === maturityDate.getTime())) {
                if (accruedInterest > 0) {
                    const intRounded = Math.round(accruedInterest);
                    balance += intRounded;
                    ledger.push({
                        date: evt.date.toISOString().split('T')[0],
                        particulars: evt.type === 'q-end' ? 'Quarterly Interest Capitalized' : 'Maturity Interest Capitalized',
                        debit: 0,
                        credit: intRounded,
                        balance: balance,
                        isInterest: true
                    });
                    accruedInterest = 0; 
                }
            }
        });
        
        const totalInterest = ledger.filter(l => l.isInterest).reduce((sum, l) => sum + l.credit, 0);

        return {
            ledger: ledger,
            finalBalance: balance,
            totalInterest: totalInterest,
            accruedUncapitalized: accruedInterest
        };
    },


    calculateDD: (principal) => {
        principal = parseFloat(principal);
        const maturityAmount = principal * 2;
        const interestEarned = principal;

        return {
            maturityAmount: Math.round(maturityAmount * 100) / 100,
            interestEarned: Math.round(interestEarned * 100) / 100
        };
    },

    getMaturityDate: (startDate, months) => {
        const start = new Date(startDate);
        const maturity = new Date(start.setMonth(start.getMonth() + parseInt(months)));
        return maturity;
    },

    calculateYearlyInterest: (principal, rate, startDate, months, compoundingFreq, totalInterestOverride) => {
        // Simple logic for interest accrual by financial year (Apr to Mar)
        // This is a complex area, for now we simplified to proportional allocation
        const start = new Date(startDate);
        const maturity = Calculations.getMaturityDate(startDate, months);
        const result = Calculations.calculateMaturity(principal, rate, months, compoundingFreq);
        const totalInterest = totalInterestOverride !== undefined ? totalInterestOverride : result.interestEarned;

        let yearlyData = {};
        let current = new Date(start);
        const totalDays = Math.ceil((maturity - start) / (1000 * 60 * 60 * 24));

        while (current < maturity) {
            let year = current.getFullYear();
            let nextFiscalYear = new Date(year, 3, 1); // April 1st of current year

            if (current >= nextFiscalYear) {
                nextFiscalYear = new Date(year + 1, 3, 1);
            }

            let endOfPeriod = nextFiscalYear > maturity ? maturity : nextFiscalYear;
            let daysInPeriod = Math.ceil((endOfPeriod - current) / (1000 * 60 * 60 * 24));

            let fiscalYearLabel = `${current.getMonth() < 3 ? current.getFullYear() - 1 : current.getFullYear()}-${(current.getMonth() < 3 ? current.getFullYear() : current.getFullYear() + 1).toString().slice(-2)}`;

            yearlyData[fiscalYearLabel] = (yearlyData[fiscalYearLabel] || 0) + (totalInterest * (daysInPeriod / totalDays));

            current = endOfPeriod;
        }

        // Clean up rounding
        for (let fy in yearlyData) {
            yearlyData[fy] = Math.round(yearlyData[fy]);
        }

        return yearlyData;
    },

    formatDate: (dateStr) => {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
    },

    /**
     * Calculates interest accrued for a specific period
     * @param {Object} d Deposit object
     * @param {string} pStart Period start date (YYYY-MM-DD)
     * @param {string} pEnd Period end date (YYYY-MM-DD)
     * @returns {number} Interest amount
     */
    calculateInterestForPeriod: (d, pStart, pEnd) => {
        const start = new Date(d.startDate + "T00:00:00");
        const maturity = new Date(d.maturityDate + "T23:59:59");
        const periodStart = new Date(pStart + "T00:00:00");
        const periodEnd = new Date(pEnd + "T23:59:59");

        // Intersection of [start, maturity] and [periodStart, periodEnd]
        const actualStart = start > periodStart ? start : periodStart;
        const actualEnd = maturity < periodEnd ? maturity : periodEnd;

        if (actualStart > actualEnd) return 0;

        const daysInPeriod = Math.ceil((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1; // inclusive

        if (d.type === 'FD') {
            // Use Simple Interest for FD as requested - matches user result (807 for 100k @ 9.5% for 31 days)
            const principal = parseFloat(d.amount);
            const rate = parseFloat(d.rate) / 100;
            const interest = (principal * rate * (daysInPeriod / 365));
            return Math.max(0, Math.round(interest));
        } else {
            // For RD and DD, use proportional allocation of total interest
            const totalDays = Math.max(1, Math.ceil((maturity - start) / (1000 * 60 * 60 * 24)));
            const interest = (d.interestEarned * (daysInPeriod / totalDays));
            return Math.max(0, Math.round(interest));
        }
    }
};
