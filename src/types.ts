/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Employee {
  id: string;
  name: string;
  monthlySalary: number;
  workingDays: number;
  workingHours: number;
  fullDaysAbsent: number;
  absentHours: number;
  absentMinutes: number;
  
  // Custom interactive HR profile fields matching SalaryPro design
  role?: string;
  email?: string;
  phone?: string;
  gender?: string;
  dob?: string;
  address?: string;
  joinDate?: string;
  workModel?: string; // 'Hybrid' | 'Remote' | 'On-Site'
  employmentType?: string; // 'Full-Time' | 'Part-Time' | 'Contract'
  notes?: string[];
  documents?: { name: string; size: string; date: string }[];
}

export interface ComputedEmployee extends Employee {
  dailyRate: number;
  hourlyRate: number;
  deductionFullDay: number;
  deductionHourly: number;
  totalDeduction: number;
  finalPayable: number;
  hasErrors: boolean;
  errorMessages: string[];
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
