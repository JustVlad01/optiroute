import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AdminNavComponent } from '../admin-nav/admin-nav.component';

interface FormTemplate {
  id: string;
  name: string;
  created_at: string;
  assignedDriverCount: number;
}

interface Driver {
  id: string;
  name: string;
  phone_number: string;
  role: string;
  selected?: boolean;
}

@Component({
  selector: 'app-form-templates',
  templateUrl: './form-templates.component.html',
  styleUrls: ['./form-templates.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, AdminNavComponent]
})
export class FormTemplatesComponent implements OnInit {
  formTemplates: FormTemplate[] = [];
  drivers: Driver[] = [];
  loading = true;
  showDriversModal = false;
  selectedForm: FormTemplate | null = null;
  selectedDrivers: string[] = [];

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.loadFormTemplates();
    this.loadDrivers();
  }

  loadFormTemplates(): void {
    // In a real app, this would fetch data from Supabase
    // For demo purposes, we'll use mock data
    
    setTimeout(() => {
      this.formTemplates = [
        {
          id: 'form-001',
          name: 'Daily Driver Form',
          created_at: '2023-05-01T08:00:00Z',
          assignedDriverCount: 3
        },
        {
          id: 'form-002',
          name: 'Vehicle Inspection Form',
          created_at: '2023-05-02T09:30:00Z',
          assignedDriverCount: 2
        },
        {
          id: 'form-003',
          name: 'Delivery Confirmation Form',
          created_at: '2023-05-03T10:45:00Z',
          assignedDriverCount: 1
        }
      ];
      this.loading = false;
    }, 1000);
  }

  loadDrivers(): void {
    // In a real app, this would fetch data from Supabase
    this.drivers = [
      { id: 'driver-001', name: 'Vlad', phone_number: '555-123-4567', role: 'Driver' },
      { id: 'driver-002', name: 'John', phone_number: '555-234-5678', role: 'Driver' },
      { id: 'driver-003', name: 'Sarah', phone_number: '555-345-6789', role: 'Driver' },
      { id: 'driver-004', name: 'Mike', phone_number: '555-456-7890', role: 'Driver' }
    ];
  }

  viewFormDetails(formId: string): void {
    console.log('Viewing form template details:', formId);
    // In a real app, this would navigate to a form details page
  }

  viewFormAssignments(form: FormTemplate): void {
    this.selectedForm = form;
    this.loadFormAssignments(form.id);
    this.showDriversModal = true;
  }

  loadFormAssignments(formId: string): void {
    // In a real app, this would fetch assignments from Supabase
    // For demo purposes, we'll use hard-coded data
    const assignedDriverIds = ['driver-001', 'driver-003'];
    
    // Reset all selections
    this.drivers.forEach(driver => driver.selected = false);
    this.selectedDrivers = [...assignedDriverIds];
    
    // Mark selected drivers
    assignedDriverIds.forEach(driverId => {
      const driver = this.drivers.find(d => d.id === driverId);
      if (driver) {
        driver.selected = true;
      }
    });
  }

  closeModal(): void {
    this.showDriversModal = false;
    this.selectedForm = null;
  }

  toggleDriverSelection(driverId: string): void {
    const index = this.selectedDrivers.indexOf(driverId);
    if (index > -1) {
      this.selectedDrivers.splice(index, 1);
    } else {
      this.selectedDrivers.push(driverId);
    }
    
    // Update driver selected state for UI
    const driver = this.drivers.find(d => d.id === driverId);
    if (driver) {
      driver.selected = !driver.selected;
    }
  }

  saveFormAssignments(): void {
    if (!this.selectedForm) return;
    
    console.log(`Saving assignments for form ${this.selectedForm.id} to drivers:`, this.selectedDrivers);
    
    // In a real app, this would save to Supabase
    // For now, we'll just update the UI
    this.selectedForm.assignedDriverCount = this.selectedDrivers.length;
    
    // Close the modal
    this.closeModal();
  }

  createNewForm(): void {
    console.log('Creating new form template');
    // In a real app, this would navigate to a form creation page
  }
} 