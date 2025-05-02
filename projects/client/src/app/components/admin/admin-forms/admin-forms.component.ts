import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AdminNavComponent } from '../admin-nav/admin-nav.component';

interface FormAssignment {
  id: string;
  assignedDate: string;
  dueDate: string;
  status: string;
  notes: string;
  completed_at?: string;
  driver_name?: string;
  driver_id?: string;
  recurring?: boolean;
}

interface Driver {
  id: string;
  name: string;
  selected?: boolean;
}

@Component({
  selector: 'app-admin-forms',
  templateUrl: './admin-forms.component.html',
  styleUrls: ['./admin-forms.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, AdminNavComponent]
})
export class AdminFormsComponent implements OnInit {
  formAssignments: FormAssignment[] = [];
  loading = true;
  selectedFilter: 'all' | 'pending' | 'completed' | 'overdue' = 'all';
  showRecurringModal = false;
  availableDrivers: Driver[] = [];
  selectedDrivers: string[] = [];
  recurringForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.recurringForm = this.fb.group({
      cooldownHours: [12],
      notes: ['Daily driver form']
    });
  }

  ngOnInit(): void {
    this.loadFormAssignments();
    this.loadAvailableDrivers();
    this.loadRecurringSettings();
  }

  loadFormAssignments(): void {
    // In a real app, this would be an API call to get all form assignments
    // For now, we'll use mock data and add any completed forms from localStorage
    
    // Start with mock data
    const mockForms: FormAssignment[] = [
      {
        id: '9e24ed84-53e6-45e0-d61c-f2d6403f2bbf',
        assignedDate: '5/2/25, 10:47 AM',
        dueDate: 'May 2, 2025',
        status: 'PENDING',
        notes: 'No notes',
        driver_name: 'Vlad',
        driver_id: 'driver-001',
        recurring: true
      },
      {
        id: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
        assignedDate: '5/1/25, 9:30 AM',
        dueDate: 'May 1, 2025',
        status: 'OVERDUE',
        notes: 'Reminder sent',
        driver_name: 'John',
        driver_id: 'driver-002'
      }
    ];
    
    // Check localStorage for any status updates
    const storedAssignments = localStorage.getItem('formAssignments');
    if (storedAssignments) {
      const assignments = JSON.parse(storedAssignments);
      
      // Update status of any forms that have been completed
      mockForms.forEach(form => {
        const updatedAssignment = assignments.find((a: any) => a.id === form.id);
        if (updatedAssignment) {
          form.status = updatedAssignment.status;
          form.completed_at = updatedAssignment.completed_at;
          form.recurring = updatedAssignment.recurring;
        }
      });
      
      // Add any additional assignments from localStorage that aren't in mock data
      assignments.forEach((assignment: any) => {
        const exists = mockForms.some(form => form.id === assignment.id);
        if (!exists) {
          mockForms.push(assignment);
        }
      });
    }
    
    // Simulate API delay
    setTimeout(() => {
      this.formAssignments = mockForms;
      this.loading = false;
    }, 1000);
  }

  loadAvailableDrivers(): void {
    // In a real app, this would be an API call to get all drivers
    this.availableDrivers = [
      { id: 'driver-001', name: 'Vlad' },
      { id: 'driver-002', name: 'John' },
      { id: 'driver-003', name: 'Sarah' },
      { id: 'driver-004', name: 'Mike' }
    ];
    
    // Check localStorage for recurring settings
    this.loadSelectedDrivers();
  }
  
  loadSelectedDrivers(): void {
    const recurringSettings = localStorage.getItem('recurringFormSettings');
    if (recurringSettings) {
      const settings = JSON.parse(recurringSettings);
      this.selectedDrivers = settings.driverIds || [];
      
      // Mark selected drivers
      this.availableDrivers.forEach(driver => {
        driver.selected = this.selectedDrivers.includes(driver.id);
      });
    }
  }

  loadRecurringSettings(): void {
    const recurringSettings = localStorage.getItem('recurringFormSettings');
    if (recurringSettings) {
      const settings = JSON.parse(recurringSettings);
      this.recurringForm.patchValue({
        cooldownHours: settings.cooldownHours || 12,
        notes: settings.notes || 'Daily driver form'
      });
    }
  }

  getFilteredForms(): FormAssignment[] {
    if (this.selectedFilter === 'all') {
      return this.formAssignments;
    }
    
    return this.formAssignments.filter(form => 
      form.status.toLowerCase() === this.selectedFilter
    );
  }

  setFilter(filter: 'all' | 'pending' | 'completed' | 'overdue'): void {
    this.selectedFilter = filter;
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

  viewFormDetails(formId: string): void {
    console.log('Viewing form details for ID:', formId);
    // In a real app, this would navigate to a detailed view
  }

  assignNewForm(): void {
    console.log('Assign new form clicked');
    // In a real app, this would open a form assignment dialog
  }

  toggleRecurringModal(): void {
    this.showRecurringModal = !this.showRecurringModal;
  }

  toggleDriverSelection(driverId: string): void {
    const index = this.selectedDrivers.indexOf(driverId);
    if (index > -1) {
      this.selectedDrivers.splice(index, 1);
    } else {
      this.selectedDrivers.push(driverId);
    }
    
    // Update driver selected state for UI
    const driver = this.availableDrivers.find(d => d.id === driverId);
    if (driver) {
      driver.selected = !driver.selected;
    }
  }

  saveRecurringSettings(): void {
    const settings = {
      driverIds: this.selectedDrivers,
      cooldownHours: this.recurringForm.value.cooldownHours,
      notes: this.recurringForm.value.notes
    };
    
    // Save settings to localStorage (in a real app, this would be an API call)
    localStorage.setItem('recurringFormSettings', JSON.stringify(settings));
    
    // Update recurring status for existing assignments
    this.updateRecurringStatusForDrivers();
    
    // Close modal
    this.showRecurringModal = false;
  }

  updateRecurringStatusForDrivers(): void {
    // Get current assignments
    const storedAssignments = localStorage.getItem('formAssignments');
    let assignments: FormAssignment[] = storedAssignments ? JSON.parse(storedAssignments) : [];
    
    // Update existing assignments
    assignments.forEach(assignment => {
      if (assignment.driver_id) {
        assignment.recurring = this.selectedDrivers.includes(assignment.driver_id);
      }
    });
    
    // Save updated assignments
    localStorage.setItem('formAssignments', JSON.stringify(assignments));
    
    // Refresh assignment list
    this.loadFormAssignments();
  }
} 