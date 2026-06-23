/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Employee {
  id: string;
  name: string;
  monthlySalary: number;
  workingDays: number;
  workingHours?: number;
  fullDaysAbsent: number;
  absentHours: number;
  absentMinutes: number;
  
  // Custom interactive HR profile fields matching SalaryPro design
  role?: string;
  department?: string;
  designation?: string;
  email?: string;
  phone?: string;
  gender?: string;
  dob?: string;
  address?: string;
  shiftTime?: string;
  shift?: 'DAY' | 'NIGHT';
  sundayPaid?: 'Paid' | 'Not Paid';
  notes?: string[];
  documents?: { name: string; size: string; date: string }[];
  
  // Salary model attributes
  salaryType?: 'fixed' | 'daily';
  advancePayment?: number;
  advanceRemarks?: string;
  advanceDate?: string;
  foodBalance?: number;
  foodRemarks?: string;
  foodDate?: string;
  partialDays?: { date: string; minutes: number }[];
  sundayOTDays?: number;
  sundayOTAmount?: number;
  elapsedDays?: number;
}

export interface ComputedEmployee extends Employee {
  dailyRate: number;
  hourlyRate: number;
  deductionFullDay: number;
  deductionHourly: number;
  deductionPartialDay?: number;
  totalDeduction: number;
  finalPayable: number;
  grossSalary: number;
  hasErrors: boolean;
  errorMessages: string[];
  sundayOTDays?: number;
  sundayOTAmount?: number;
}

export interface SalarySettings {
  defaultWorkingDays: number;
  defaultWorkingHours: number;
  passwordProtection: string;
}

export interface FilterOptions {
  searchQuery: string;
  minSalary: string;
  maxSalary: string;
  hasAbsenceOnly: boolean;
  highDeductionsOnly: boolean;
  sortBy: 'id' | 'name' | 'salary' | 'deduction' | 'finalPay';
  sortOrder: 'asc' | 'desc';
}

export interface PunchLog {
  id: string; // Date formatted as YYYY-MM-DD
  employeeId: string;
  date: string; // YYYY-MM-DD
  punches: string[]; // Format: "HH:MM IN" or "HH:MM OUT" (e.g., ["08:00 IN", "13:00 OUT"])
}

export interface LoomOrderRow {
  size: string;
  quality: string;
  gsm: number;
  denier: number;
  fabricWeight: number; // FABRIC WEIGHT PER METER
  totalQuantity: number; // TOTAL QUANTITY TO MAKE (IN TON)
  remarks?: string;
  productionCompleted?: number;
  status?: 'Pending' | 'Production' | 'Completed';
}

export interface LoomOrder {
  id: string;
  orderNo: string;
  date: string; // YYYY-MM-DD
  status: 'Pending' | 'Production' | 'Completed';
  rows: LoomOrderRow[];
  createdAt: string;
}
