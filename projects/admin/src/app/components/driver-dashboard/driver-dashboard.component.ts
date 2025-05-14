import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

// Define interfaces for the types
interface FormAssignment {
  id: string;
  driver_id: string;
  form_template_id: string;
  status: string;
  due_date: string;
  completed_at?: string;
  form_id?: string;
  notes?: string;
  form_templates?: any;
}

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './driver-dashboard.component.html',
  styleUrls: ['./driver-dashboard.component.scss']
})
export class DriverDashboardComponent implements OnInit {
  driverId: string = '';
  driverName: string = '';
  assignedForms: FormAssignment[] = [];
  completedForms: FormAssignment[] = [];
  isLoading = true;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    
    try {
      // Get driver info from localStorage instead of session
      const loggedInDriverStr = localStorage.getItem('loggedInDriver');
      
      if (loggedInDriverStr) {
        try {
          const driver = JSON.parse(loggedInDriverStr);
          this.driverId = driver.id;
          this.driverName = driver.name;
          await this.loadAssignedForms();
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
      console.error('Error initializing driver dashboard:', error);
      this.isLoading = false;
    }
  }

  async loadAssignedForms(): Promise<void> {
    if (!this.driverId) {
      this.isLoading = false;
      return;
    }

    try {
      const assignments = await this.supabaseService.getDriverFormAssignments(this.driverId);
      
      if (assignments) {
        // Separate pending/overdue from completed forms
        this.assignedForms = assignments.filter((a: FormAssignment) => a.status !== 'completed');
        this.completedForms = assignments.filter((a: FormAssignment) => a.status === 'completed');
      } else {
        console.error('Failed to load form assignments');
      }
    } catch (error) {
      console.error('Error loading assigned forms:', error);
    } finally {
      this.isLoading = false;
    }
  }

  fillOutForm(assignmentId: string): void {
    // Navigate to the form filling page with the assignment ID
    this.router.navigate(['/driver/fill-form', assignmentId]);
  }

  viewForm(formId: string | undefined): void {
    // Navigate to view a completed form if formId exists
    if (formId) {
      this.router.navigate(['/driver-forms/view', formId]);
    } else {
      console.error('Cannot view form: form ID is undefined');
    }
  }

  getStatusClass(status: string): string {
    return status === 'overdue' ? 'status-overdue' : 'status-pending';
  }

  formatDueDate(dueDate: string): string {
    if (!dueDate) return 'No due date';
    
    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
      return 'Today';
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }
    
    return date.toLocaleDateString();
  }

  async logout(): Promise<void> {
    // Clear localStorage and redirect to login
    localStorage.removeItem('loggedInDriver');
    this.router.navigate(['/login']);
  }
} 