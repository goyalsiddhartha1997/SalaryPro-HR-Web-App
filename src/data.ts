/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Employee, ComputedEmployee } from './types';

// Let's create a functional helper that validates and computes all required salaries
export function calculateSalary(emp: Employee, sundayPaidRule: 'totalMonthDays' | '26Days' = 'totalMonthDays'): ComputedEmployee {
  const errorMessages: string[] = [];
  
  // Real-time validations
  const salary = Number(emp.monthlySalary) || 0;
  const days = Number(emp.workingDays) || 0;
  const hours = Number(emp.workingHours) || 0;
  const fullAbs = Number(emp.fullDaysAbsent) || 0;
  const absHours = Number(emp.absentHours) || 0;
  const absMins = Number(emp.absentMinutes) || 0;

  // Track if there are invalid inputs
  let hasErrors = false;
  const isTemplate = emp.id.startsWith('EMP_TEMP_') || !emp.name.trim();

  if (!isTemplate) {
    if (salary < 0) {
      hasErrors = true;
      errorMessages.push('Monthly Salary cannot be negative.');
    }
    if (days <= 0) {
      hasErrors = true;
      errorMessages.push('Working Days in Month must be greater than 0.');
    }
    if (hours < 0) {
      hasErrors = true;
      errorMessages.push('Working Hours Per Day cannot be negative.');
    }
    if (fullAbs < 0) {
      hasErrors = true;
      errorMessages.push('Full Days Absent cannot be negative.');
    }
    if (absHours < 0) {
      hasErrors = true;
      errorMessages.push('Absent Hours cannot be negative.');
    }
    if (absMins < 0 || absMins >= 60) {
      hasErrors = true;
      errorMessages.push('Absent Minutes must be between 0 and 59.');
    }
    if (fullAbs > days) {
      hasErrors = true;
      errorMessages.push('Days absent cannot exceed working days.');
    }
  }

  // Set safe computation values
  const salaryType = emp.salaryType || 'fixed';
  const advance = Number(emp.advancePayment) || 0;
  const food = Number(emp.foodBalance) || 0;

  const safeSalary = Math.max(0, salary);
  const safeDays = days > 0 ? days : 26;
  const safeHours = hours > 0 ? hours : 9;
  const safeFullAbs = Math.max(0, fullAbs);
  const safeAbsHours = Math.max(0, absHours);
  const safeAbsMins = Math.max(0, Math.min(59, absMins));

  // Determine the dynamic calculation divisor
  const isSundayPaid = emp.sundayPaid === 'Paid';
  const calculationDivisor = (sundayPaidRule === '26Days' && isSundayPaid) ? 26 : safeDays;

  // Intermediate Calculations in full precision based on salary basis
  let rawDailyRate = 0;
  let rawBaseMonthly = 0;

  if (salaryType === 'daily') {
    rawDailyRate = safeSalary; // In daily rate mode, 'monthlySalary' field input is the daily rate
    const activeElapsed = (emp.elapsedDays !== undefined && emp.elapsedDays > 0) ? emp.elapsedDays : calculationDivisor;
    rawBaseMonthly = rawDailyRate * activeElapsed; // Theoretical base if they had worked full days
  } else {
    rawDailyRate = safeSalary / calculationDivisor;
    rawBaseMonthly = (emp.elapsedDays !== undefined && emp.elapsedDays > 0) ? (rawDailyRate * emp.elapsedDays) : safeSalary;
  }

  const rawHourlyRate = rawDailyRate / safeHours;
  
  const rawDeductionFullDay = rawDailyRate * safeFullAbs;
  const rawTotalAbsentHours = safeAbsHours + (safeAbsMins / 60);
  const rawDeductionHourly = rawHourlyRate * rawTotalAbsentHours;
  
  let rawDeductionPartialDay = 0;
  if (emp.partialDays && emp.partialDays.length > 0) {
    emp.partialDays.forEach(pd => {
      const workedHours = pd.minutes / 60;
      const unworkedHours = Math.max(0, safeHours - workedHours);
      rawDeductionPartialDay += unworkedHours * rawHourlyRate;
    });
  }
  
  // Calculate Sunday OT for fixed basis salary employees when Sunday is worked and Sunday is Paid
  const isFixed = salaryType === 'fixed';
  const sundayOTDays = emp.sundayOTDays || 0;
  const isSundayOTEligible = isFixed && isSundayPaid;
  const rawSundayOTAmount = isSundayOTEligible ? (sundayOTDays * rawDailyRate) : 0;

  const rawTotalDeduction = rawDeductionFullDay + rawDeductionHourly + rawDeductionPartialDay + advance + food;
  const rawFinalPayable = Math.max(0, rawBaseMonthly + rawSundayOTAmount - rawTotalDeduction);

  return {
    ...emp,
    monthlySalary: salary,
    workingDays: days,
    workingHours: hours,
    fullDaysAbsent: fullAbs,
    absentHours: absHours,
    absentMinutes: absMins,
    salaryType,
    advancePayment: advance,
    foodBalance: food,
    dailyRate: Math.round(rawDailyRate * 100) / 100,
    hourlyRate: Math.round(rawHourlyRate * 100) / 100,
    deductionFullDay: Math.round(rawDeductionFullDay * 100) / 100,
    deductionHourly: Math.round(rawDeductionHourly * 100) / 100,
    deductionPartialDay: Math.round(rawDeductionPartialDay * 100) / 100,
    totalDeduction: Math.round(rawTotalDeduction * 100) / 100,
    finalPayable: Math.round(rawFinalPayable * 100) / 100,
    grossSalary: Math.round(rawBaseMonthly * 100) / 100,
    hasErrors,
    errorMessages,
    sundayOTDays: sundayOTDays,
    sundayOTAmount: Math.round(rawSundayOTAmount * 100) / 100,
  };
}

// Generate the 150+ standard entries with real parsed information from the employee CSV
export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: '8',
    name: 'Harmeet Kaur',
    monthlySalary: 10000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'HR Mgr',
    designation: 'HR Mgr',
    department: 'HR',
    shiftTime: '09:00-18:00',
    phone: '78767-76550',
    address: 'Devinagar, Paonta Sahib, Near Priyanshi Hoapital, Sirmour (HP)-173025',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '52',
    name: 'Roshani',
    monthlySalary: 400,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Maid',
    designation: 'Maid',
    department: 'Cleaning',
    shiftTime: '08:00-17:00',
    phone: '70187-78060',
    address: 'Pipliwala, Sirmour, Himachal Pradesh-173001',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '23',
    name: 'Dharmesh Thapa',
    monthlySalary: 16000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Guard',
    designation: 'Guard',
    department: 'Security',
    shiftTime: '07:30-20:30',
    phone: '78766-76979',
    address: 'Nepal',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '24',
    name: 'Ram Singh',
    monthlySalary: 15000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Guard',
    designation: 'Guard',
    department: 'Security',
    shiftTime: '07:00-19:00',
    phone: '78767-11756',
    address: 'Daghera(95), Thana Kashoga, Sirmour, Himachal Pradesh-173022',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '26',
    name: 'Roshan Lal',
    monthlySalary: 18000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Driver',
    designation: 'Driver',
    department: 'Driver',
    shiftTime: '08:00-18:00',
    phone: '83510-12052',
    address: 'Sainwala, Mubarakpur(151), Sirmour(HP)-173021',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '42',
    name: 'Jaswinder Jassi',
    monthlySalary: 18000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Driver',
    designation: 'Driver',
    department: 'Driver',
    shiftTime: '08:00-08:00',
    phone: '85808-26896',
    address: 'Chhachhrauli, Ledi, Haryana-135103',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '29',
    name: 'Shamshad-Sonu',
    monthlySalary: 25000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Electrician',
    designation: 'Electrician',
    department: 'Electrical',
    shiftTime: '09:00-18:00',
    phone: '98828-17990',
    address: 'Puruwala kanshipur, Paonta Sahib sirmour, Himachal Pradesh-173001',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '35',
    name: 'Waris',
    monthlySalary: 18000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Electrician',
    designation: 'Electrician',
    department: 'Electrical',
    shiftTime: '08:00-17:00',
    phone: '70183-66630',
    address: 'Kiratpur bhagwanpur, Puruwala, Sirmour(HP)-173001',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '31',
    name: 'Chaman Lal',
    monthlySalary: 15000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Electrician',
    designation: 'Electrician',
    department: 'Electrical',
    shiftTime: '08:00-17:00',
    phone: '98054-97969',
    address: 'Ajauli, Paonta Sahib, Sirmour, Himachal Pradesh-173025',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '33',
    name: 'Ajay Kumar',
    monthlySalary: 8100,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Electrician',
    designation: 'Electrician',
    department: 'Electrical',
    shiftTime: '08:00-17:00',
    phone: '70184-61983',
    address: 'Johron, Paonta Sahib, Johron, Sirmour, Himachal Pradesh-173001',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '34',
    name: 'Pankaj Kumar',
    monthlySalary: 8100,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Electrican',
    designation: 'Electrican',
    department: 'Electrical',
    shiftTime: '08:00-17:00',
    phone: '93171-57704',
    address: 'Parduni, Paonta Sahib, Sirmour, Himachal Pradesh-173020',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '30',
    name: 'Harsh Kumar',
    monthlySalary: 15000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Welder',
    designation: 'Welder',
    department: 'Welding',
    shiftTime: '08:00-17:00',
    phone: '62300-37701',
    address: 'Ghutanpur, Paonta Sahib, Sirmour, Himachal Pradesh-173025',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '28',
    name: 'Faheem',
    monthlySalary: 800,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Welder',
    designation: 'Welder',
    department: 'Welding',
    shiftTime: '08:00-17:00',
    phone: '97197-77245',
    address: 'Gangoh Khalsa, Saharanpur(UP)-247341',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '32',
    name: 'Md Shadab',
    monthlySalary: 700,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Welder',
    designation: 'Welder',
    department: 'Welding',
    shiftTime: '08:00-17:00',
    phone: '95578-61687',
    address: 'Deoband, Sharanpur, Uttar Pradesh-247554',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '39',
    name: 'Inshaal',
    monthlySalary: 550,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Welder',
    designation: 'Welder',
    department: 'Welding',
    shiftTime: '08:00-17:00',
    phone: '74528-08028',
    address: 'Muzaffar nagar, Deoband, Saharanpur, Uttar pradesh-247554',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '38',
    name: 'Surender',
    monthlySalary: 700,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Painter',
    designation: 'Painter',
    department: 'Painting',
    shiftTime: '08:00-17:00',
    phone: '97369-43144',
    address: 'Puruwala kanshipur, Paonta sahib, Sirmour, Himachal Pradesh-173001',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '57',
    name: 'Padam Saini',
    monthlySalary: 27000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Welder',
    designation: 'Welder',
    department: 'Welding',
    shiftTime: '08:00-18:00',
    phone: '92596-23250',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '13',
    name: 'Shyam Mani Tripathi',
    monthlySalary: 28000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Fitter',
    designation: 'Fitter',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '80525-50856',
    address: 'Pipara Chandbhan, Deori, Uttar Pradesh-274001',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '11',
    name: 'Manoj',
    monthlySalary: 30000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Electrician',
    designation: 'Electrician',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '99715-07119',
    address: 'SK colony, House no.C195, Sector:110, Noida, Uttar Pradesh-201304',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '14',
    name: 'Shyam Bihari Mourya',
    monthlySalary: 27000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Fitter',
    designation: 'Fitter',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '63888-02855',
    address: 'Ward no.16, Gorakhpur, UP-273007',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '12',
    name: 'Dinesh Giri',
    monthlySalary: 30000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Fitter',
    designation: 'Fitter',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '74568-91574',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '15',
    name: 'Raj Gautam',
    monthlySalary: 630,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Winder man',
    designation: 'Winder man',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '86039-27575',
    address: '',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '16',
    name: 'Mihilal Yadav',
    monthlySalary: 670,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '85059-69680',
    address: 'Ptatappur chamurkha Ambedkar nagar, UP-224151',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '17',
    name: 'Roopesh',
    monthlySalary: 670,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '87992-51210',
    address: '',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '22',
    name: 'Abhishek Verma',
    monthlySalary: 27000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'QC',
    designation: 'QC',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '73095-72535',
    address: 'bachhaipur, P.O. bachhaipur, ballia(UP)-221711',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '53',
    name: 'Krishan Gopal',
    monthlySalary: 670,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '94544-72538',
    address: 'Banda, Baghelabari, uttar pradesh-210202',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '54',
    name: 'Sant Ram',
    monthlySalary: 27000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Fitter',
    designation: 'Fitter',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '96284-00241',
    address: 'Paundara, Banda, Atarra, Uttar Pardesh - 210201',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '55',
    name: 'Hardyal',
    monthlySalary: 30000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Plant Operator',
    designation: 'Plant Operator',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '75058-40271',
    address: 'Arjunpur, Dist: Hathras, Uttar Pradesh - 204101',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '56',
    name: 'Ashish Kumar',
    monthlySalary: 630,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Winder man',
    designation: 'Winder man',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '72510-39524',
    address: 'Borrakhurd, Pondri, Etah, Uttar Pradesh - -207301',
    salaryType: 'daily',
    sundayPaid: 'Not Paid'
  },
  {
    id: '58',
    name: 'Vishram Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '59',
    name: 'Satish Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '60',
    name: 'Rajveer Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Contractor',
    designation: 'Contractor',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '61',
    name: 'Arun Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '62',
    name: 'Rahul Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '63',
    name: 'Deepak Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '64',
    name: 'Rakesh Shriwastav',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Prod. Mngr.',
    designation: 'Prod. Mngr.',
    department: 'Tape Plant',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '65',
    name: 'Satyendar Babu',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '66',
    name: 'Himanshu Singh',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '67',
    name: 'Vipin',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '68',
    name: 'Ram Dayal',
    monthlySalary: 20000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '69',
    name: 'Ravinder Paswal',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Loom Operator',
    designation: 'Loom Operator',
    department: 'Loom',
    shiftTime: '8:00-20:00',
    phone: '',
    address: '',
    salaryType: 'fixed',
    sundayPaid: 'Not Paid'
  },
  {
    id: '44',
    name: 'Rakesh',
    monthlySalary: 15000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Sweeper',
    designation: 'Sweeper',
    department: 'Cleaning',
    shiftTime: '8:00-17:00',
    phone: '88944-05295',
    address: 'Kedarpur, Sirmour(HP)-173025',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '45',
    name: 'Balwinder',
    monthlySalary: 15000,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Welder',
    designation: 'Welder',
    department: 'Welding',
    shiftTime: '8:00-17:00',
    phone: '98824-85973',
    address: 'Sainwala, paonta sahib, Sirmour(HP)-173021',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '46',
    name: 'Vikas',
    monthlySalary: 12750,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Helper',
    designation: 'Helper',
    department: 'Helping',
    shiftTime: '8:00-17:00',
    phone: '88943-25993',
    address: 'Mtak majri, Majra, paonta sahib, Sirmour(HP)-173021',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '47',
    name: 'Mukesh',
    monthlySalary: 12750,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Helper',
    designation: 'Helper',
    department: 'Helping',
    shiftTime: '8:00-17:00',
    phone: '82195-53862',
    address: 'Mtak majri, Majra, paonta sahib, Sirmour(HP)-173021',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '50',
    name: 'Manoj',
    monthlySalary: 12750,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
    role: 'Helper',
    designation: 'Helper',
    department: 'Helping',
    shiftTime: '8:00-17:00',
    phone: '86270-54129',
    address: 'Paonta sahib, Kishanpura, Sirmour(HP)-173025',
    salaryType: 'fixed',
    sundayPaid: 'Paid'
  },
  {
    id: '4',
    name: 'Laxman Verma',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0
  },
  {
    id: '43',
    name: '43',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0
  },
  {
    id: '41',
    name: 'Susheel Mishra',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0
  },
  {
    id: '49',
    name: 'Shamsher Ali',
    shiftTime: '08:00 - 17:00',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0
  },
  {
    id: '48',
    name: 'Ravi Kumar',
    shiftTime: '08:00 - 17:00',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0
  },
  {
    id: '51',
    name: 'Raghuveer',
    shiftTime: '08:00 - 17:00',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0
  }
];

// Generate up to 160 entries as empty editable rows
for (let i = INITIAL_EMPLOYEES.length; i <= 160; i++) {
  const id = `EMP_TEMP_${String(i).padStart(3, '0')}`;
  INITIAL_EMPLOYEES.push({
    id,
    name: '',
    monthlySalary: 0,
    workingDays: 0,
    workingHours: 0,
    fullDaysAbsent: 0,
    absentHours: 0,
    absentMinutes: 0,
  });
}

// Assign correct gender and ensure zero '001' shifts remain in static data
INITIAL_EMPLOYEES.forEach(emp => {
  emp.shift = 'DAY';
  if (emp.name === 'Harmeet Kaur' || emp.name === 'Roshani') {
    emp.gender = 'Female';
  } else {
    emp.gender = 'Male';
  }
  
  if (emp.shiftTime === '001') {
    emp.shiftTime = '08:00-20:00';
  }

  // Update BASIS (salaryType) to fixed for monthly salary > 2000, else daily (only if not already set)
  if ((emp.name || '').trim() !== '' && !emp.salaryType) {
    if (emp.monthlySalary > 2000) {
      emp.salaryType = 'fixed';
    } else {
      emp.salaryType = 'daily';
    }
  }
});

export const getWorkMinutes = (punches: string[]): number => {
  if (!punches || punches.length < 2) return 0;
  let totalMinutes = 0;
  let activeInTime: { h: number; m: number } | null = null;

  punches.forEach(p => {
    const parts = p.trim().split(' ');
    if (parts.length < 2) return;
    const timeStr = parts[0];
    const type = parts.slice(1).join(' ').toUpperCase();

    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);

    if (isNaN(h) || isNaN(m)) return;

    const isCheckIn = type.startsWith('IN') || type.startsWith('ARR') || type.includes('IN') || type.includes('ARR');
    const isCheckOut = type.startsWith('OUT') || type.includes('OUT') || type.includes('DEP') || type.includes('EXIT');

    if (isCheckIn) {
      activeInTime = { h, m };
    } else if (isCheckOut && activeInTime) {
      const startMin = activeInTime.h * 60 + activeInTime.m;
      const endMin = h * 60 + m;
      let diff = endMin - startMin;
      if (diff < 0) {
        diff += 1440; // overnight crossing midnight support
      }
      totalMinutes += diff;
      activeInTime = null;
    }
  });
  return totalMinutes;
};

export const getShiftTimingDurationHours = (shiftTime?: string, fallbackWorkingHours?: number): number => {
  if (!shiftTime || !shiftTime.trim()) {
    return fallbackWorkingHours || 8;
  }
  const parts = shiftTime.split(/[-—–]/).map(s => s.trim());
  if (parts.length !== 2) {
    return fallbackWorkingHours || 8;
  }

  const parsePart = (p: string) => {
    const clean = p.replace(/\./g, ':').replace(/\s/g, '');
    const match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    const singleHourMatch = clean.match(/^(\d{1,2})$/);
    if (singleHourMatch) {
      return parseInt(singleHourMatch[1], 10) * 60;
    }
    return null;
  };

  const startMins = parsePart(parts[0]);
  const endMins = parsePart(parts[1]);
  if (startMins === null || endMins === null) {
    return fallbackWorkingHours || 8;
  }

  let diff = endMins - startMins;
  if (diff <= 0) {
    diff += 1440;
  }
  return diff / 60;
};

export const isEmployeePresent = (
  punchesList: string[],
  shiftTime?: string,
  workingHours?: number
): boolean => {
  if (!punchesList || punchesList.length === 0) return false;
  const allZero = punchesList.every(p => {
    const parts = p.trim().split(' ');
    return parts[0] === '00:00';
  });
  if (allZero) return false;

  const hasOutPunch = punchesList.some(p => {
    const uppercase = p.toUpperCase();
    return uppercase.includes('OUT') || uppercase.includes('EXIT') || uppercase.includes('DEP');
  });

  if (hasOutPunch) {
    return true;
  }

  const minutes = getWorkMinutes(punchesList);
  const shiftHours = getShiftTimingDurationHours(shiftTime, workingHours || 8);
  const threshold = shiftHours * 60 * 0.85;
  if (minutes < threshold) {
    return false;
  }
  return true;
};

export const getNextDateStr = (dateStr: string): string => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

export const getAdjustedPunches = (
  empId: string,
  empShift: 'DAY' | 'NIGHT' | string | undefined,
  dateStr: string,
  allPunchLogs: Record<string, Record<string, string[]>>
): string[] => {
  const empPunches = allPunchLogs[empId] || {};
  if (empShift === 'NIGHT') {
    const todayPunches = empPunches[dateStr] || [];
    const cleanToday = todayPunches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
    
    const nextDateStr = getNextDateStr(dateStr);
    const nextDayPunches = empPunches[nextDateStr] || [];
    const cleanNextDay = nextDayPunches.filter(p => !p.startsWith('00:00') && p.trim() !== '');
    
    const inPunches = cleanToday.filter(p => {
      const uc = p.toUpperCase();
      return uc.includes('IN') || uc.includes('ARR');
    });
    let outPunches = cleanToday.filter(p => {
      const uc = p.toUpperCase();
      return uc.includes('OUT') || uc.includes('DEP') || uc.includes('EXIT');
    });
    if (outPunches.length === 0) {
      outPunches = cleanNextDay.filter(p => {
        const uc = p.toUpperCase();
        return uc.includes('OUT') || uc.includes('DEP') || uc.includes('EXIT');
      });
    }
    
    inPunches.sort((a, b) => a.localeCompare(b));
    outPunches.sort((a, b) => a.localeCompare(b));
    
    return [...inPunches, ...outPunches];
  } else {
    const raw = empPunches[dateStr] || [];
    return raw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
  }
};
