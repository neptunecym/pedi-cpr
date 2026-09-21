(function () {
  'use strict';

  const form = document.getElementById('patientForm');
  const ageYearsInput = document.getElementById('ageYears');
  const ageMonthsInput = document.getElementById('ageMonths');
  const weightInput = document.getElementById('weightInput');
  const unknownWeightBtn = document.getElementById('unknownWeightBtn');
  const errorMsg = document.getElementById('errorMsg');
  const patientSummary = document.getElementById('patientSummary');
  const ageSummaryValue = document.getElementById('ageSummaryValue');
  const weightUsedValue = document.getElementById('weightUsedValue');
  const weightSourceNote = document.getElementById('weightSourceNote');
  const printBtn = document.getElementById('printBtn');

  let unknownWeightActive = false;

  unknownWeightBtn.addEventListener('click', function () {
    unknownWeightActive = !unknownWeightActive;
    unknownWeightBtn.classList.toggle('active', unknownWeightActive);
    weightInput.disabled = unknownWeightActive;
    if (unknownWeightActive) {
      weightInput.value = '';
    }
  });

  printBtn.addEventListener('click', function () {
    window.print();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculate();
  });

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
    patientSummary.hidden = true;
  }

  function clearError() {
    errorMsg.hidden = true;
  }

  function formatNum(value) {
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function calcIBW(ageYears, ageMonths) {
    const totalMonths = ageYears * 12 + ageMonths;
    if (totalMonths < 12) {
      return (totalMonths + 9) / 2;
    } else if (ageYears <= 6) {
      return ageYears * 2 + 8;
    } else if (ageYears <= 12) {
      return (ageYears * 7 - 5) / 2;
    }
    return 40;
  }

  function capValue(value, max) {
    if (max === null || max === undefined) return value;
    return Math.min(value, max);
  }

  function setResult(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function computeMlOnly(weight, mlPerKg, maxMl, resultId) {
    const raw = weight * mlPerKg;
    setResult(resultId, formatNum(capValue(raw, maxMl)));
  }

  function computeMg(weight, mgPerKg, maxMg, mgId) {
    const rawMg = weight * mgPerKg;
    setResult(mgId, formatNum(capValue(rawMg, maxMg)));
  }

  function renderRangeResult(lowId, highId, suffixId, lowText, highText) {
    setResult(lowId, lowText);
    const suffixEl = document.getElementById(suffixId);
    const isSingle = lowText === highText;
    if (!isSingle) setResult(highId, highText);
    if (suffixEl) suffixEl.hidden = isSingle;
  }

  function ettBounds(raw) {
    const scaled = raw * 2;
    const roundedScaled = Math.round(scaled);
    if (Math.abs(scaled - roundedScaled) < 1e-9) {
      const single = (roundedScaled / 2).toFixed(1);
      return { low: single, high: single };
    }
    const low = Math.floor(scaled) / 2;
    return { low: low.toFixed(1), high: (low + 0.5).toFixed(1) };
  }

  function renderDrugs(weight) {
    // Adrenaline 1:10,000 IV: 0.1 ml/kg, conc 0.1 mg/ml, max 1 mg/dose -> ceiling 10 ml
    computeMlOnly(weight, 0.1, 10, 'adrIV');
    // Adrenaline 1:1,000 ET: 0.1 ml/kg, conc 1 mg/ml, max 1 mg/dose -> ceiling 1 ml
    computeMlOnly(weight, 0.1, 1, 'adrET1k');

    // Amiodarone: 5 mg/kg
    computeMg(weight, 5, 150, 'amio1Mg');
    computeMg(weight, 5, 300, 'amio2Mg');
    computeMg(weight, 5, 300, 'amio3Mg');

    // Atropine: 0.02 mg/kg, max 0.5 mg
    computeMg(weight, 0.02, 0.5, 'atropineMg');

    // Adenosine
    computeMg(weight, 0.1, 6, 'adeno1Mg');
    computeMg(weight, 0.2, 12, 'adeno2Mg');

    // 2% Lidocaine: 1 mg/kg, no max
    computeMg(weight, 1, null, 'lidoMg');

    // Naloxone: 0.1 mg/kg, max 2 mg
    computeMg(weight, 0.1, 2, 'naloxMg');

    // 10% Calcium gluconate: 1 ml/kg, max 10 ml
    computeMlOnly(weight, 1, 10, 'calciumMl');

    // 7.5% NaHCO3: 1 ml/kg, max 50 ml
    computeMlOnly(weight, 1, 50, 'nahco3Ml');

    // 50% MgSO4: 25-50 mg/kg range, max total 2000 mg, 500 mg/ml
    const mgLowCapped = capValue(weight * 25, 2000);
    const mgHighCapped = capValue(weight * 50, 2000);
    renderRangeResult('mgso4Low', 'mgso4High', 'mgso4RangeSuffix',
      formatNum(mgLowCapped / 500), formatNum(mgHighCapped / 500));

    // 50% Glucose: 1 ml/kg, max 50 ml
    computeMlOnly(weight, 1, 50, 'glucoseMl');

    // Diazepam: 0.3 mg/kg, max 10 mg
    computeMg(weight, 0.3, 10, 'diazepamMg');
  }

  function renderDevices(ageYears, ageMonths) {
    const ageDecimal = (ageYears * 12 + ageMonths) / 12;

    const cuffed = ettBounds(ageDecimal / 4 + 3.5);
    renderRangeResult('ettCuffedLow', 'ettCuffedHigh', 'ettCuffedRangeSuffix', cuffed.low, cuffed.high);

    const uncuffed = ettBounds(ageDecimal / 4 + 4);
    renderRangeResult('ettUncuffedLow', 'ettUncuffedHigh', 'ettUncuffedRangeSuffix', uncuffed.low, uncuffed.high);

    const depth = Math.round(ageDecimal / 2 + 12);
    setResult('ettDepth', String(depth));
  }

  function calculate() {
    clearError();

    const ageYearsRaw = ageYearsInput.value.trim();
    const ageMonthsRaw = ageMonthsInput.value.trim();

    if (ageYearsRaw === '' && ageMonthsRaw === '') {
      showError('กรุณากรอกอายุ (ปีและ/หรือเดือน)');
      return;
    }

    const ageYears = ageYearsRaw === '' ? 0 : parseInt(ageYearsRaw, 10);
    const ageMonths = ageMonthsRaw === '' ? 0 : parseInt(ageMonthsRaw, 10);

    if (isNaN(ageYears) || isNaN(ageMonths) || ageYears < 0 || ageMonths < 0 || ageMonths > 11) {
      showError('กรุณากรอกอายุให้ถูกต้อง (เดือน: 0-11)');
      return;
    }

    const weightRaw = weightInput.value.trim();
    let weightUsed;
    let sourceNote;

    if (!unknownWeightActive && weightRaw !== '') {
      const w = parseFloat(weightRaw);
      if (isNaN(w) || w <= 0) {
        showError('กรุณากรอกน้ำหนักตัวให้ถูกต้อง');
        return;
      }
      weightUsed = w;
      sourceNote = '(น้ำหนักที่กรอก)';
    } else if (unknownWeightActive) {
      weightUsed = calcIBW(ageYears, ageMonths);
      sourceNote = '(คำนวณจาก Ideal Body Weight)';
    } else {
      showError('กรุณากรอกน้ำหนักตัว หรือกดปุ่ม "ไม่ทราบน้ำหนัก"');
      return;
    }

    ageSummaryValue.textContent = ageYears + ' ปี ' + ageMonths + ' เดือน';
    weightUsedValue.textContent = formatNum(weightUsed);
    weightSourceNote.textContent = sourceNote;
    patientSummary.hidden = false;

    renderDrugs(weightUsed);
    renderDevices(ageYears, ageMonths);
  }
})();
