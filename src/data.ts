/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Employee, ComputedEmployee } from './types';

// Let's create a functional helper that validates and computes all required salaries
export function calculateSalary(emp: Employee): ComputedEmployee {
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
    if (hours <= 0) {
      hasErrors = true;
      errorMessages.push('Working Hours Per Day must be greater than 0.');
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
  const safeSalary = Math.max(0, salary);
  const safeDays = days > 0 ? days : 26;
  const safeHours = hours > 0 ? hours : 9;
  const safeFullAbs = Math.max(0, fullAbs);
  const safeAbsHours = Math.max(0, absHours);
  const safeAbsMins = Math.max(0, Math.min(59, absMins));

  // Intermediate Calculations in full precision
  const rawDailyRate = safeSalary / safeDays;
  const rawHourlyRate = rawDailyRate / safeHours;
  
  const rawDeductionFullDay = rawDailyRate * safeFullAbs;
  const rawTotalAbsentHours = safeAbsHours + (safeAbsMins / 60);
  const rawDeductionHourly = rawHourlyRate * rawTotalAbsentHours;
  
  const rawTotalDeduction = rawDeductionFullDay + rawDeductionHourly;
  const rawFinalPayable = Math.max(0, safeSalary - rawTotalDeduction);

  return {
    ...emp,
    monthlySalary: salary,
    workingDays: days,
    workingHours: hours,
    fullDaysAbsent: fullAbs,
    absentHours: absHours,
    absentMinutes: absMins,
    dailyRate: Math.round(rawDailyRate * 100) / 100,
    hourlyRate: Math.round(rawHourlyRate * 100) / 100,
    deductionFullDay: Math.round(rawDeductionFullDay * 100) / 100,
    deductionHourly: Math.round(rawDeductionHourly * 100) / 100,
    totalDeduction: Math.round(rawTotalDeduction * 100) / 100,
    finalPayable: Math.round(rawFinalPayable * 100) / 100,
    hasErrors,
    errorMessages,
  };
}

// Generate the 150+ standard entries. Let's make sure the first 45 entries are filled with realistic details.
export const INITIAL_EMPLOYEES: Employee[] = [
  { id: '55', name: 'Hardyal', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '16', name: 'Mihilal Yadav', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '32', name: 'Md Shadab', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '11', name: 'Manoj', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '50', name: 'Manoj', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '4', name: 'Laxman Verma', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '53', name: 'Krishna Gopal', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '42', name: 'Jaswinder', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '39', name: 'Inshaald', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '43', name: '43', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '8', name: 'Harmeet Kaur', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '34', name: 'Pankaj', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '28', name: 'Faheem', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '12', name: 'Dinesh Giri', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '63', name: 'Deepak Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '31', name: 'Chaman Lal', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '45', name: 'Balwinder', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '56', name: 'Ashish Kumar', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '61', name: 'Arun Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '33', name: 'Ajay', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '22', name: 'Abhishek Verma', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '30', name: 'Harsh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '17', name: 'Roopesh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '58', name: 'Vishram Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '46', name: 'Vikas', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '23', name: 'Thapa', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '41', name: 'Susheel Mishra', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '38', name: 'Surender', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '14', name: 'Shyam Bihari Maurya', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '49', name: 'Shamsher Ali', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '59', name: 'Satish Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '54', name: 'Sant Ram', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '47', name: 'Mukesh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '26', name: 'Roshan Lal', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '57', name: 'Padam Saini', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '48', name: 'Ravi Kumar', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '24', name: 'Ram Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '64', name: 'Rakesh Shriwastav', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '44', name: 'Rakesh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '60', name: 'Rajveer Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '15', name: 'Raj Gautam', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '62', name: 'Rahul Singh', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '51', name: 'Raghuveer', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '35', name: 'Waris', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 },
  { id: '52', name: 'Roshani', monthlySalary: 0, workingDays: 0, workingHours: 0, fullDaysAbsent: 0, absentHours: 0, absentMinutes: 0 }
];

// Generate up to 160 entries as empty editable rows
for (let i = 46; i <= 160; i++) {
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
