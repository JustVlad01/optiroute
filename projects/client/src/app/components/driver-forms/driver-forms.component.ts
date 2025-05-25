import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormAssignment } from '../../services/models/form-assignment.model';

@Component({
  selector: 'app-driver-forms',
  templateUrl: './driver-forms.component.html',
  styleUrls: ['./driver-forms.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class DriverFormsComponent implements OnInit {
  forms: FormAssignment[] = [];
  loading = true;
  successMessage: string | null = null;
  driverId = '';
  driverName = '';
  nextFormAvailableTime: Date | null = null;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) { }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    
    try {
      // Get driver info from localStorage instead of session
      const loggedInDriverStr = localStorage.getItem('loggedInDriver');
      
      if (loggedInDriverStr) {
        try {
          const driver = JSON.parse(loggedInDriverStr);
          this.driverId = driver.id;
          this.driverName = driver.name;
          
          // Load form assignments for the driver
          await this.loadDriverFormAssignments();
        } catch (e) {
          console.error('Error parsing logged in driver data', e);
          // Redirect to login if driver data is invalid
          this.router.navigate(['/login']);
        }
      } else {
        // Not logged in, redirect to login
        this.router.navigate(['/login']);
      }
    } catch (error) {
      console.error('Error initializing driver forms:', error);
    } finally {
      this.loading = false;
    }
    
    // Check for success message from query params
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    
    if (success === 'true') {
      this.successMessage = 'Form submitted successfully!';
      // Clear the success message after 5 seconds
      setTimeout(() => {
        this.successMessage = null;
      }, 5000);
    }
  }

  async loadDriverFormAssignments(): Promise<void> {
    if (!this.driverId) return;
    
    try {
      const assignments = await this.supabaseService.getDriverFormAssignments(this.driverId);
      
      if (assignments) {
        // Transform the data to match our interface
        this.forms = assignments.map((assignment: any) => ({
          id: assignment.id,
          driver_id: assignment.driver_id,
          driver_name: assignment.driver_name,
          status: assignment.status.toUpperCase(),
          due_date: assignment.due_date || '',
          completed_at: assignment.completed_at,
          form_id: assignment.form_id,
          notes: assignment.notes || '',
          created_at: assignment.created_at,
          reset_period: assignment.reset_period,
          partial_form_data: assignment.partial_form_data,
          partially_completed: assignment.partially_completed
        }));
      }
    } catch (error) {
      console.error('Error loading driver form assignments:', error);
    }
  }

  viewForm(formId: string): void {
    // Navigate to form details page
    this.router.navigate(['/form-details', formId]);
  }

  clearSuccessMessage(): void {
    this.successMessage = null;
  }
  
  getStatusBadgeClass(status: string): string {
    switch(status.toUpperCase()) {
      case 'COMPLETED':
        return 'bg-success';
      case 'PENDING':
        return 'bg-warning';
      case 'OVERDUE':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }
} 