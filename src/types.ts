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
  
  joiningDate?: string;
  resignDate?: string;
  
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
  contractor?: string;
  activeStatus?: 'ACTIVE' | 'INACTIVE';
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
  sortBy: 'id' | 'name' | 'salary' | 'deduction' | 'finalPay' | 'contractor' | 'activeStatus' | 'department' | 'designation' | 'sundayPaid' | 'shift' | 'salaryType' | 'monthlySalary';
  sortOrder: 'asc' | 'desc';
}

export interface PunchLog {
  id: string; // Date formatted as YYYY-MM-DD
  employeeId: string;
  date: string; // YYYY-MM-DD
  punches: string[]; // Format: "HH:MM IN" or "HH:MM OUT" (e.g., ["08:00 IN", "13:00 OUT"])
}

export interface RollDispatchDetails {
  dispatchDate?: string; // YYYY-MM-DD
  vehicleNo?: string;
  driverName?: string;
  driverPhone?: string;
  challanNo?: string;
  invoiceNo?: string;
  customerName?: string;
  destination?: string;
  dispatchedWeight?: number;
  dispatchedMeters?: number;
  remarks?: string;
  dispatchedAt?: string;
}

export interface LoomOrderRow {
  size: string;
  quality: string;
  gsm: number;
  denier: number;
  fabricWeight: number; // FABRIC WEIGHT PER METER
  totalQuantity: number; // TOTAL QUANTITY TO MAKE (IN KG)
  remarks?: string;
  productionCompleted?: number;
  status?: 'Pending' | 'Production' | 'Completed';
  noOfRolls?: number;
  laminationType?: string;
  rollNumbers?: string[]; // Array of unique roll numbers (e.g., ["R-101", "R-102"])
  rollRemarks?: Record<string, string>; // Map of roll number to individual roll remarks
  dispatchedRolls?: string[]; // Array of roll numbers that have been dispatched
  rollDispatchStatus?: Record<string, 'Dispatched' | 'Not Dispatched'>; // Map of roll number to dispatch status
  rollDispatchDetails?: Record<string, RollDispatchDetails>; // Detailed dispatch entry per roll
  rollGrossWt?: Record<string, number>;
  rollCoreWt?: Record<string, number>;
  rollNetWt?: Record<string, number>;
  rollAvgWtCalculated?: Record<string, number>;
  rollMeters?: Record<string, number>;
  rollStrength?: Record<string, string | number>;
  rollElongation?: Record<string, string | number>;
  rollWarpStrength?: Record<string, string | number>;
  rollWarpElongation?: Record<string, string | number>;
  rollWeftStrength?: Record<string, string | number>;
  rollWeftElongation?: Record<string, string | number>;
}

export interface LoomOrder {
  id: string;
  orderNo: string;
  date: string; // YYYY-MM-DD
  status: 'Pending' | 'Production' | 'Completed';
  rows: LoomOrderRow[];
  createdAt: string;
}

export interface InventoryLog {
  id: string;
  date: string;
  type: 'add_stock' | 'use_stock' | 'correction';
  quantity: number;
  remarks?: string;
  operator?: string;
  createdAt: string;
  shift?: 'Day Shift' | 'Night Shift';
  stage?: string;
  wastage?: number;
  reconciliation?: string;
}

export interface RawMaterialItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  remarks?: string;
  lastUpdated: string;
  logs?: InventoryLog[];
  noOfBags?: number;
  kgPerBag?: number;
  registrationDate?: string;
}

export interface LoomRunningRow {
  loomNo: string;
  operatorName?: string;
  mesh?: string;
  totalMeters?: number;
  quality: string;
  size: string;
  gsm: number;
  denier: number;
  average: number;
  rollNo?: string;
  warpStrength?: string | number;
  warpElongation?: string | number;
  weftStrength?: string | number;
  weftElongation?: string | number;
  rollMeters?: number;
  grossWt?: number;
  coreWt?: number;
  netWt?: number;
  avgWtCalculated?: number;
  gsmCalculated?: number;
  runningStatus: 'Running' | 'Stopped';
  remarks?: string;
}

export interface LoomRunningReport {
  id: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD
  rows: LoomRunningRow[];
  createdAt: string;
  isAllStopped?: boolean;
  remarks?: string;
  shift?: 'DAY' | 'NIGHT';
}

export interface TapePlantProductionReport {
  id: string; // YYYY-MM-DD-shift
  date: string; // YYYY-MM-DD
  shift: 'day' | 'night';
  usage: string; // e.g. PP used, CC used, LD used, TPT used detailed text
  wastage: number;
  isStopped: boolean;
  isAutoGenerated?: boolean;
  remarks?: string;
  createdAt: string;
  operatorsCount?: number;
  windermenCount?: number;
  helpersCount?: number;
}

export interface TapePlantRunningRow {
  id: string;
  roundNo: number | string;
  denier: number | string;
  quality: string;
  strength: number | string; // in kgs
  elongation: number | string; // in %
  tapeWidth?: number | string; // in mm
  remarks?: string;
}

export interface TapePlantRunningReport {
  id: string; // YYYY-MM-DD-shift or auto ID
  date: string; // YYYY-MM-DD
  shift: 'DAY' | 'NIGHT';
  rounds: TapePlantRunningRow[];
  totalEmployees?: number;
  remarks?: string;
  createdAt: string;
}

