import { Component, OnInit } from '@angular/core';
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
  assignmentForm!: FormGroup;
  isLoading = true;
  showAssignmentForm = false;
  minDate: string;
  resetPeriodOptions = [
    { value: 4, label: '4 Hours' },
    { value: 8, label: '8 Hours' },
    { value: 10, label: '10 Hours' }
  ];

  constructor(
    private supabaseService: SupabaseService,
    private fb: FormBuilder,
    private router: Router
  ) {
    // Set minimum date to today for due date picker
    const today = new Date();
    this.minDate = this.formatDate(today);
  }

  ngOnInit(): void {
    this.loadDrivers();
    this.loadFormAssignments();
    this.initForm();
  }

  initForm(): void {
    this.assignmentForm = this.fb.group({
      driverId: ['', Validators.required],
      resetPeriod: ['', Validators.required],
      notes: ['']
    });
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
      } else {
        console.error('Failed to load form assignments');
      }
    });
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

  viewCompletedForm(formId: string): void {
    // Navigate to form details view
    this.router.navigate(['/driver-forms/view', formId]);
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
} 