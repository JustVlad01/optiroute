import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-form-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './form-assignments.component.html',
  styleUrls: ['./form-assignments.component.scss']
})
export class FormAssignmentsComponent implements OnInit {
  drivers: any[] = [];
  formAssignments: any[] = [];
  filteredAssignments: any[] = [];
  assignmentForm!: FormGroup;
  filterForm!: FormGroup;
  isLoading = true;
  showAssignmentForm = false;
  minDate: string;
  resetPeriodOptions = [
    { value: 4, label: '4 Hours' },
    { value: 8, label: '8 Hours' },
    { value: 10, label: '10 Hours' }
  ];
  
  // Date filter options
  availableYears: number[] = [];
  availableMonths: { value: number, label: string }[] = [];
  availableWeeks: { value: string, label: string, monthValue: number }[] = [];
  viewAllMonthOption: boolean = false;
  
  // Filter options
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = 0;
  selectedWeek: string = '';
  selectedDriver: string = '';
  showNeedsReview: boolean = false;
  showOverdue: boolean = false;
  
  // Submission date filter options
  showSubmittedOnly: boolean = false;
  showNotSubmittedOnly: boolean = false;

  constructor(
    private supabaseService: SupabaseService,
    private fb: FormBuilder,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    // Set minimum date to today for due date picker
    const today = new Date();
    this.minDate = this.formatDate(today);
    
    // Initialize years (current year and 2 previous years)
    const currentYear = today.getFullYear();
    this.availableYears = [currentYear, currentYear - 1, currentYear - 2];
    
    // Initialize months
    this.generateMonthOptions();
    
    // Initialize weeks for current month and year
    this.generateWeekOptions(currentYear, new Date().getMonth() + 1);
  }

  ngOnInit(): void {
    this.loadDrivers();
    this.loadFormAssignments();
    this.initForm();
    this.initFilterForm();
    
    // Force change detection after initialization
    setTimeout(() => {
      this.cdr.detectChanges();
    });
  }

  initForm(): void {
    this.assignmentForm = this.fb.group({
      driverId: ['', Validators.required],
      resetPeriod: ['', Validators.required],
      notes: ['']
    });
  }

  initFilterForm(): void {
    this.filterForm = this.fb.group({
      yearFilter: [this.selectedYear],
      monthFilter: [0], // 0 means "All Months"
      weekFilter: [''], // Empty means "All Weeks" or "Whole Month"
      viewAllMonthOption: [false],
      driverFilter: [''],
      needsReviewFilter: [false],
      overdueFilter: [false],
      signedFilter: [false],
      submittedOnlyFilter: [false],
      notSubmittedOnlyFilter: [false]
    });

    // Log initial filter state
    console.log('Initial filter form value:', this.filterForm.value);

    // Force initial values to be applied
    this.selectedYear = this.filterForm.get('yearFilter')?.value;
    this.selectedMonth = this.filterForm.get('monthFilter')?.value;
    this.selectedWeek = this.filterForm.get('weekFilter')?.value;
    this.viewAllMonthOption = this.filterForm.get('viewAllMonthOption')?.value;
    
    // Subscribe to year changes
    this.filterForm.get('yearFilter')?.valueChanges.subscribe(year => {
      console.log('Year filter changed:', year);
      if (year) {
        this.selectedYear = year;
        this.generateMonthOptions();
        this.filterForm.patchValue({ monthFilter: 0, weekFilter: '' }, { emitEvent: false });
        this.applyFilters();
        this.cdr.detectChanges();
      }
    });
    
    // Subscribe to month changes
    this.filterForm.get('monthFilter')?.valueChanges.subscribe(month => {
      console.log('Month filter changed:', month);
      if (month !== null && month !== undefined) {
        this.selectedMonth = month;
        if (month > 0) {
          this.generateWeekOptions(this.selectedYear, month);
        }
        this.filterForm.patchValue({ weekFilter: '' }, { emitEvent: false });
        this.applyFilters();
        this.cdr.detectChanges();
      }
    });
    
    // Subscribe to week changes
    this.filterForm.get('weekFilter')?.valueChanges.subscribe(week => {
      console.log('Week filter changed:', week);
      this.applyFilters();
      this.cdr.detectChanges();
    });
    
    // Subscribe to view all month option
    this.filterForm.get('viewAllMonthOption')?.valueChanges.subscribe(viewAll => {
      console.log('View all month changed:', viewAll);
      this.viewAllMonthOption = viewAll;
      if (viewAll) {
        this.filterForm.patchValue({ weekFilter: '' }, { emitEvent: false });
      }
      this.applyFilters();
      this.cdr.detectChanges();
    });
    
    // Subscribe to submitted/not submitted filter changes
    this.filterForm.get('submittedOnlyFilter')?.valueChanges.subscribe(submitted => {
      console.log('Submitted filter changed:', submitted);
      if (submitted) {
        this.filterForm.patchValue({ notSubmittedOnlyFilter: false }, { emitEvent: false });
      }
      this.applyFilters();
      this.cdr.detectChanges();
    });
    
    this.filterForm.get('notSubmittedOnlyFilter')?.valueChanges.subscribe(notSubmitted => {
      console.log('Not submitted filter changed:', notSubmitted);
      if (notSubmitted) {
        this.filterForm.patchValue({ submittedOnlyFilter: false }, { emitEvent: false });
      }
      this.applyFilters();
      this.cdr.detectChanges();
    });
    
    // Subscribe to other filter changes
    ['driverFilter', 'needsReviewFilter', 'overdueFilter', 'signedFilter'].forEach(control => {
      this.filterForm.get(control)?.valueChanges.subscribe(value => {
        console.log(`${control} changed:`, value);
        this.applyFilters();
        this.cdr.detectChanges();
      });
    });
  }

  // Method to handle select dropdown changes directly
  onFilterChange(filterName: string, event: any): void {
    const value = event.target.value;
    
    if (filterName === 'yearFilter') {
      this.selectedYear = Number(value);
      this.generateMonthOptions();
      this.filterForm.patchValue({ 
        yearFilter: this.selectedYear,
        monthFilter: 0, 
        weekFilter: '' 
      }, { emitEvent: false });
    } 
    else if (filterName === 'monthFilter') {
      this.selectedMonth = Number(value);
      if (this.selectedMonth > 0) {
        this.generateWeekOptions(this.selectedYear, this.selectedMonth);
      }
      this.filterForm.patchValue({ 
        monthFilter: this.selectedMonth,
        weekFilter: '' 
      }, { emitEvent: false });
    } 
    else if (filterName === 'weekFilter') {
      this.selectedWeek = value;
      this.filterForm.patchValue({ weekFilter: this.selectedWeek }, { emitEvent: false });
    } 
    else if (filterName === 'driverFilter') {
      this.selectedDriver = value;
      this.filterForm.patchValue({ driverFilter: this.selectedDriver }, { emitEvent: false });
    }
    
    this.applyFilters();
    this.cdr.detectChanges();
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  loadDrivers(): void {
    this.supabaseService.getAllDrivers().then(drivers => {
      if (drivers) {
        this.drivers = drivers;
      } else {
        console.error('Failed to load drivers');
      }
    });
  }

  loadFormAssignments(): void {
    this.isLoading = true;
    this.supabaseService.getAllFormAssignments().then(assignments => {
      this.isLoading = false;
      if (assignments) {
        this.formAssignments = assignments;
        this.filteredAssignments = [...this.formAssignments];
        this.applyFilters();
      } else {
        console.error('Failed to load form assignments');
      }
    });
  }

  // Generate month options
  generateMonthOptions(): void {
    this.availableMonths = [
      { value: 1, label: 'January' },
      { value: 2, label: 'February' },
      { value: 3, label: 'March' },
      { value: 4, label: 'April' },
      { value: 5, label: 'May' },
      { value: 6, label: 'June' },
      { value: 7, label: 'July' },
      { value: 8, label: 'August' },
      { value: 9, label: 'September' },
      { value: 10, label: 'October' },
      { value: 11, label: 'November' },
      { value: 12, label: 'December' }
    ];
  }

  // Generate week options for a specific month and year
  generateWeekOptions(year: number, month: number): void {
    const weeks = [];
    
    // Get first day of the month
    const firstDay = new Date(year, month - 1, 1);
    
    // Get last day of the month
    const lastDay = new Date(year, month, 0);
    
    // Get the first Sunday of the month or the last Sunday of the previous month
    const firstSunday = new Date(firstDay);
    firstSunday.setDate(firstDay.getDate() - firstDay.getDay());
    
    // Generate weeks for the month
    let currentWeekStart = new Date(firstSunday);
    
    // Keep generating weeks until we're past the last day of the month
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      
      const startStr = this.formatDateForDisplay(currentWeekStart);
      const endStr = this.formatDateForDisplay(weekEnd);
      
      weeks.push({
        value: this.formatDate(currentWeekStart),
        label: `${startStr} - ${endStr}`,
        monthValue: month
      });
      
      // Move to next week
      currentWeekStart = new Date(currentWeekStart);
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    
    this.availableWeeks = weeks;
  }
  
  // Format date for display (e.g., "Apr 1")
  formatDateForDisplay(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }

  // Apply all filters to the assignments
  applyFilters(): void {
    const filterValues = this.filterForm.value;
    
    // Log filter values for debugging
    console.log('Filter values:', {
      year: filterValues.yearFilter,
      month: filterValues.monthFilter,
      week: filterValues.weekFilter,
      viewAllMonth: filterValues.viewAllMonthOption,
      needsReview: filterValues.needsReviewFilter,
      overdue: filterValues.overdueFilter,
      signed: filterValues.signedFilter,
      submitted: filterValues.submittedOnlyFilter,
      notSubmitted: filterValues.notSubmittedOnlyFilter
    });
    
    this.filteredAssignments = this.formAssignments.filter(assignment => {
      // Date filter (Year/Month/Week)
      let passesDateFilter = true;
      const assignmentDate = new Date(assignment.created_at);
      const submissionDate = assignment.completed_at ? new Date(assignment.completed_at) : null;
      
      // For debugging
      const assignmentMonth = assignmentDate.getMonth() + 1; // +1 because getMonth() is 0-indexed
      const submissionMonth = submissionDate ? submissionDate.getMonth() + 1 : null;
      
      // Log dates for debugging
      if (filterValues.monthFilter === 5) { // If filtering by May (5)
        console.log('Assignment:', {
          id: assignment.id,
          created: assignment.created_at,
          assignmentMonth,
          completed: assignment.completed_at,
          submissionMonth
        });
      }
      
      // Year filter
      if (filterValues.yearFilter) {
        // Check both assignment and submission date years
        const assignmentYear = assignmentDate.getFullYear();
        const submissionYear = submissionDate ? submissionDate.getFullYear() : null;
        
        // Pass if either date matches the filter year
        passesDateFilter = assignmentYear === filterValues.yearFilter || 
                           (submissionDate !== null && submissionYear === filterValues.yearFilter);
      }
      
      // Month filter - fixed to properly handle month as a number
      if (passesDateFilter && filterValues.monthFilter > 0) {
        // Check both assignment and submission date months
        const monthMatches = assignmentMonth === filterValues.monthFilter ||
                           (submissionDate !== null && submissionMonth === filterValues.monthFilter);
                           
        // Log month comparison for debugging
        if (filterValues.monthFilter === 5) {
          console.log('Month comparison:', {
            assignmentMonth,
            submissionMonth, 
            filterMonth: filterValues.monthFilter,
            matches: monthMatches
          });
        }
        
        passesDateFilter = monthMatches;
      }
      
      // Week filter
      if (passesDateFilter && filterValues.weekFilter && !filterValues.viewAllMonthOption) {
        const weekStart = new Date(filterValues.weekFilter);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        // Check if either assignment date or submission date falls within the selected week
        passesDateFilter = (assignmentDate >= weekStart && assignmentDate <= weekEnd) ||
                           (submissionDate !== null && submissionDate >= weekStart && submissionDate <= weekEnd);
      }
      
      // Driver filter
      let passesDriverFilter = true;
      if (filterValues.driverFilter) {
        passesDriverFilter = assignment.driver_id === filterValues.driverFilter;
      }
      
      // Needs review filter
      let passesReviewFilter = true;
      if (filterValues.needsReviewFilter) {
        passesReviewFilter = assignment.status === 'completed' && 
                            assignment.driver_forms?.needs_review === true;
      }
      
      // Overdue filter
      let passesOverdueFilter = true;
      if (filterValues.overdueFilter) {
        passesOverdueFilter = assignment.status === 'overdue';
      }
      
      // Signed filter
      let passesSignedFilter = true;
      if (filterValues.signedFilter) {
        passesSignedFilter = assignment.status === 'signed';
      }
      
      // Submitted/Not Submitted filter
      let passesSubmissionFilter = true;
      if (filterValues.submittedOnlyFilter) {
        passesSubmissionFilter = !!assignment.completed_at;
      } else if (filterValues.notSubmittedOnlyFilter) {
        passesSubmissionFilter = !assignment.completed_at;
      }
      
      const result = passesDateFilter && 
             passesDriverFilter && 
             passesReviewFilter && 
             passesOverdueFilter &&
             passesSignedFilter &&
             passesSubmissionFilter;
             
      // Log final result for debugging
      if (filterValues.monthFilter === 5 && result) {
        console.log('Assignment passes filter:', assignment.id);
      }
      
      return result;
    });
    
    console.log(`Filtered to ${this.filteredAssignments.length} of ${this.formAssignments.length} assignments`);
    
    // Force change detection
    this.cdr.detectChanges();
  }

  // Reset all filters
  resetFilters(): void {
    const currentYear = new Date().getFullYear();
    this.filterForm.reset({
      yearFilter: currentYear,
      monthFilter: 0,
      weekFilter: '',
      viewAllMonthOption: false,
      driverFilter: '',
      needsReviewFilter: false,
      overdueFilter: false,
      signedFilter: false,
      submittedOnlyFilter: false,
      notSubmittedOnlyFilter: false
    });
    
    this.selectedYear = currentYear;
    this.selectedMonth = 0;
    this.selectedWeek = '';
    this.viewAllMonthOption = false;
    
    this.generateMonthOptions();
    this.filteredAssignments = [...this.formAssignments];
    
    // Force change detection
    this.cdr.detectChanges();
  }

  getDriverName(driverId: string): string {
    const driver = this.drivers.find(d => d.id === driverId);
    return driver ? driver.name : 'Unknown Driver';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'completed':
        return 'status-completed';
      case 'overdue':
        return 'status-overdue';
      case 'signed':
        return 'status-signed';
      default:
        return '';
    }
  }

  toggleAssignmentForm(): void {
    this.showAssignmentForm = !this.showAssignmentForm;
    if (this.showAssignmentForm) {
      this.assignmentForm.reset();
    }
  }

  assignForm(): void {
    if (this.assignmentForm.valid) {
      const { driverId, resetPeriod, notes } = this.assignmentForm.value;
      
      this.supabaseService.assignFormToDriver(driverId, null, notes, resetPeriod)
        .then(result => {
          if (result) {
            this.loadFormAssignments();
            this.toggleAssignmentForm();
          } else {
            alert('Failed to assign form. Please try again.');
          }
        });
    } else {
      Object.keys(this.assignmentForm.controls).forEach(key => {
        const control = this.assignmentForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  getResetPeriodText(hours: number): string {
    if (!hours) return 'N/A';
    return `${hours} Hours`;
  }

  deleteAssignment(assignmentId: string): void {
    if (confirm('Are you sure you want to delete this assignment?')) {
      this.supabaseService.deleteFormAssignment(assignmentId)
        .then(success => {
          if (success) {
            this.loadFormAssignments();
          } else {
            alert('Failed to delete assignment. Please try again.');
          }
        });
    }
  }

  markAsOverdue(assignmentId: string): void {
    this.supabaseService.updateFormAssignmentStatus(assignmentId, 'overdue')
      .then(result => {
        if (result) {
          this.loadFormAssignments();
        } else {
          alert('Failed to update assignment status. Please try again.');
        }
      });
  }

  markAsSigned(assignmentId: string, formId: string): void {
    // First mark the form as no longer needing review
    this.supabaseService.updateFormNeedsReview(formId, false)
      .then(success => {
        if (success) {
          // Then update the assignment status to signed
          this.supabaseService.updateFormAssignmentStatus(assignmentId, 'signed')
            .then(result => {
              if (result) {
                this.loadFormAssignments();
              } else {
                alert('Failed to mark as signed. Please try again.');
              }
            });
        } else {
          alert('Failed to update form review status. Please try again.');
        }
      });
  }

  viewCompletedForm(formId: string): void {
    // Navigate to form details view
    this.router.navigate(['/driver-forms/view', formId]);
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // Helper method for debugging checkbox clicks
  logFilterClick(filterName: string): void {
    console.log(`${filterName} filter clicked`);
  }
} 