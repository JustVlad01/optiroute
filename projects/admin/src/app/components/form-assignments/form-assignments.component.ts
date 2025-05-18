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
    console.log('Loading form assignments...');
    
    this.supabaseService.getAllFormAssignments().then(assignments => {
      this.isLoading = false;
      console.log('Assignments received from service:', assignments ? assignments.length : 0);
      
      if (assignments && assignments.length > 0) {
        // The drivers information is already attached to each assignment in the service
        this.formAssignments = assignments;
        
        console.log('First assignment after mapping:', this.formAssignments[0]);
        this.filteredAssignments = [...this.formAssignments];
        this.applyFilters();
      } else {
        console.error('Failed to load form assignments or no assignments found');
        this.formAssignments = [];
        this.filteredAssignments = [];
      }
    }).catch(error => {
      this.isLoading = false;
      console.error('Exception loading form assignments:', error);
      this.formAssignments = [];
      this.filteredAssignments = [];
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
    if (!this.formAssignments || this.formAssignments.length === 0) {
      this.filteredAssignments = [];
      return;
    }
    
    // Get filter values
    const driverFilter = this.filterForm.get('driverFilter')?.value || '';
    const needsReview = this.filterForm.get('needsReviewFilter')?.value || false;
    const overdue = this.filterForm.get('overdueFilter')?.value || false;
    const signed = this.filterForm.get('signedFilter')?.value || false;
    const submittedOnly = this.filterForm.get('submittedOnlyFilter')?.value || false;
    const notSubmittedOnly = this.filterForm.get('notSubmittedOnlyFilter')?.value || false;
    
    console.log('Applying filters with values:', {
      year: this.selectedYear,
      month: this.selectedMonth,
      week: this.selectedWeek,
      driver: driverFilter,
      needsReview,
      overdue,
      signed,
      submittedOnly,
      notSubmittedOnly
    });
    
    // Apply filters
    this.filteredAssignments = this.formAssignments.filter(assignment => {
      // Safe access to properties
      const assignmentDate = assignment.created_at ? new Date(assignment.created_at) : null;
      const status = assignment.status || '';
      const driverId = assignment.driver_id || '';
      
      // Skip items without a valid date
      if (!assignmentDate) return false;
      
      // Year filter
      if (this.selectedYear && assignmentDate.getFullYear() !== this.selectedYear) {
        return false;
      }
      
      // Month filter (if not "All Months")
      if (this.selectedMonth > 0 && assignmentDate.getMonth() + 1 !== this.selectedMonth) {
        return false;
      }
      
      // Week filter
      if (this.selectedWeek && !this.viewAllMonthOption) {
        const [year, month, startDay, endDay] = this.selectedWeek.split('-').map(Number);
        const assignmentDay = assignmentDate.getDate();
        
        if (
          assignmentDate.getFullYear() !== year ||
          assignmentDate.getMonth() + 1 !== month ||
          assignmentDay < startDay ||
          assignmentDay > endDay
        ) {
          return false;
        }
      }
      
      // Driver filter
      if (driverFilter && driverId !== driverFilter) {
        return false;
      }
      
      // Status filters
      if (needsReview && (!assignment.driver_forms || !assignment.driver_forms.needs_review)) {
        return false;
      }
      
      if (overdue && status !== 'overdue') {
        return false;
      }
      
      if (signed && status !== 'signed') {
        return false;
      }
      
      // Submitted/not submitted filters
      if (submittedOnly && !assignment.completed_at) {
        return false;
      }
      
      if (notSubmittedOnly && assignment.completed_at) {
        return false;
      }
      
      return true;
    });
    
    console.log(`Filtered ${this.formAssignments.length} assignments down to ${this.filteredAssignments.length}`);
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
    if (!status) return 'status-unknown';
    
    switch (status.toLowerCase()) {
      case 'pending':
        return 'status-pending';
      case 'completed':
        return 'status-completed';
      case 'overdue':
        return 'status-overdue';
      case 'signed':
        return 'status-signed';
      default:
        return 'status-unknown';
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
      const today = new Date();
      const dueDate = this.formatDate(today);
      
      console.log('Assigning form with data:', { driverId, resetPeriod, notes, dueDate });
      
      this.supabaseService.assignFormToDriver(driverId, null, notes, dueDate)
        .then(result => {
          if (result && result.success) {
            console.log('Form assigned successfully:', result.data);
            this.loadFormAssignments();
            this.toggleAssignmentForm();
          } else {
            console.error('Failed to assign form:', result?.error);
            alert('Failed to assign form. Please try again.');
          }
        })
        .catch(error => {
          console.error('Exception assigning form:', error);
          alert('An error occurred while assigning the form.');
        });
    } else {
      Object.keys(this.assignmentForm.controls).forEach(key => {
        const control = this.assignmentForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  getResetPeriodText(hours: number): string {
    if (!hours && hours !== 0) return 'N/A';
    
    if (hours === 0) return 'No reset';
    if (hours === 1) return '1 Hour';
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