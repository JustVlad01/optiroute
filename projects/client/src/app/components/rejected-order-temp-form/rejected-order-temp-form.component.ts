import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-rejected-order-temp-form',
  templateUrl: './rejected-order-temp-form.component.html',
  styleUrls: ['./rejected-order-temp-form.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule]
})
export class RejectedOrderTempFormComponent implements OnInit {
  rejectedOrderTempForm!: FormGroup;
  loading = false;
  submitting = false;
  isViewMode = false;
  formId: string | null = null;
  completedDate: string | null = null;
  
  // Driver info
  driverId = '';
  driverName = '';
  
  // Store search functionality
  storeSearchTerm = '';
  filteredStores: any[] = [];
  allStores: any[] = [];
  
  // File upload tracking
  selectedFiles: { [key: string]: File | null } = {
    photo_temp_reading_customer: null,
    photo_van_display_temp: null,
    photo_probe_reading_destructive_pack: null
  };

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    this.initializeForm();
    await this.loadDriverInfo();
    await this.loadStores();
    
    // Check if this is for a specific form ID
    this.formId = this.route.snapshot.paramMap.get('id');
    
    if (this.formId) {
      await this.loadFormData();
    }
  }

  initializeForm(): void {
    this.rejectedOrderTempForm = this.fb.group({
      driver_name: ['', Validators.required],
      date: [new Date().toISOString().split('T')[0], Validators.required],
      route_number: ['', Validators.required],
      van_registration: ['', Validators.required],
      store_name: ['', Validators.required],
      store_id: [''],
      arrival_time_at_store: ['', Validators.required],
      wait_time_at_store: ['', [Validators.required, Validators.min(0)]],
      site_keys: ['', Validators.required],
      driving_start_time: ['', Validators.required],
      drop_number_on_route: ['', [Validators.required, Validators.min(1)]],
      total_crates_into_store: ['', [Validators.required, Validators.min(0)]],
      van_temp_by_display: ['', Validators.required],
      probe_serial_number: ['', Validators.required],
      probe_temperature: ['', Validators.required],
      customer_temperature: ['', Validators.required],
      destroyed_pack_for_testing: ['', Validators.required],
      used_pack_in_van_for_testing: ['', Validators.required],
      weather_conditions: ['', Validators.required],
      full_name_of_products_sampled: ['', Validators.required],
      photo_temp_reading_customer: [''],
      photo_van_display_temp: [''],
      photo_probe_reading_destructive_pack: [''],
      further_comments: ['']
    });
  }

  async loadDriverInfo(): Promise<void> {
    try {
      const loggedInDriverStr = localStorage.getItem('loggedInDriver');
      
      if (loggedInDriverStr) {
        const driver = JSON.parse(loggedInDriverStr);
        this.driverId = driver.id;
        this.driverName = driver.name;
        
        // Prefill driver name
        this.rejectedOrderTempForm.patchValue({
          driver_name: this.driverName
        });
      } else {
        this.router.navigate(['/login']);
      }
    } catch (error) {
      console.error('Error loading driver info:', error);
      this.router.navigate(['/login']);
    }
  }

  async loadStores(): Promise<void> {
    try {
      this.allStores = await this.supabaseService.getAllStores();
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  }

  async loadFormData(): Promise<void> {
    if (!this.formId) return;
    
    try {
      this.loading = true;
      
      // Check if form is completed to determine view mode
      const formAssignment = await this.supabaseService.getFormAssignment(this.formId);
      
      if (formAssignment?.status === 'COMPLETED') {
        this.isViewMode = true;
        this.completedDate = formAssignment.completed_at;
        
        // Load completed form data
        const formData = await this.supabaseService.getRejectedOrderTempFormData(this.formId);
        
        if (formData) {
          this.rejectedOrderTempForm.patchValue(formData);
          this.rejectedOrderTempForm.disable();
        }
      }
    } catch (error) {
      console.error('Error loading form data:', error);
    } finally {
      this.loading = false;
    }
  }

  onStoreSearchInput(): void {
    if (this.storeSearchTerm.length >= 2) {
      this.filteredStores = this.allStores.filter(store => {
        const storeName = store.store_name || store.dispatch_store_name || '';
        const storeCode = store.store_code || store.dispatch_code || '';
        
        return storeName.toLowerCase().includes(this.storeSearchTerm.toLowerCase()) ||
               storeCode.toLowerCase().includes(this.storeSearchTerm.toLowerCase());
      }).slice(0, 10);
    } else {
      this.filteredStores = [];
    }
    
    // Check if the current search term exactly matches a store
    const exactMatch = this.allStores.find(store => {
      const storeName = store.store_name || store.dispatch_store_name || '';
      const storeCode = store.store_code || store.dispatch_code || '';
      const combinedFormat = `${storeCode} - ${storeName}`;
      
      return combinedFormat.toLowerCase() === this.storeSearchTerm.toLowerCase() ||
             storeName.toLowerCase() === this.storeSearchTerm.toLowerCase() ||
             storeCode.toLowerCase() === this.storeSearchTerm.toLowerCase();
    });
    
    if (exactMatch) {
      // Auto-select if exact match found
      this.rejectedOrderTempForm.patchValue({
        store_name: exactMatch.store_name || exactMatch.dispatch_store_name,
        store_id: exactMatch.id
      });
    } else {
      // Clear the hidden fields if no exact match
      this.rejectedOrderTempForm.patchValue({
        store_name: '',
        store_id: ''
      });
    }
  }

  selectStore(store: any): void {
    const storeName = store.store_name || store.dispatch_store_name || '';
    const storeCode = store.store_code || store.dispatch_code || '';
    
    this.storeSearchTerm = `${storeCode} - ${storeName}`;
    this.rejectedOrderTempForm.patchValue({
      store_name: storeName,
      store_id: store.id
    });
    this.filteredStores = [];
  }

  onStoreSearchBlur(): void {
    // Hide the dropdown when user clicks away
    setTimeout(() => {
      this.filteredStores = [];
    }, 200); // Small delay to allow for click events on dropdown items
    
    // Mark the store_name field as touched for validation
    this.rejectedOrderTempForm.get('store_name')?.markAsTouched();
  }

  async submitForm(): Promise<void> {
    if (this.rejectedOrderTempForm.invalid || this.submitting) {
      this.markFormGroupTouched();
      return;
    }

    try {
      this.submitting = true;
      
      const formData = {
        ...this.rejectedOrderTempForm.value,
        driver_id: this.driverId,
        form_type: 'rejected_order_temp_checklist'
      };

      if (this.formId) {
        // Update existing form
        await this.supabaseService.updateRejectedOrderTempForm(this.formId, formData);
        
        // Mark form as completed
        await this.supabaseService.updateFormAssignmentStatus(this.formId, 'COMPLETED');
      } else {
        // Create new form submission
        await this.supabaseService.createRejectedOrderTempForm(formData);
      }

      // Navigate back to driver forms with success message
      this.router.navigate(['/driver-forms'], { 
        queryParams: { success: 'true' } 
      });
      
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Error submitting form. Please try again.');
    } finally {
      this.submitting = false;
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.rejectedOrderTempForm.controls).forEach(key => {
      const control = this.rejectedOrderTempForm.get(key);
      control?.markAsTouched();
    });
  }

  goBack(): void {
    this.router.navigate(['/driver-forms']);
  }
  
  // File upload methods
  triggerFileInput(inputId: string): void {
    const fileInput = document.getElementById(inputId) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }
  
  onFileSelected(event: any, fieldName: string): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFiles[fieldName] = file;
      
      // Update the form control with the file
      this.rejectedOrderTempForm.patchValue({
        [fieldName]: file
      });
    }
  }
  
  getSelectedFileName(fieldName: string): string | null {
    const file = this.selectedFiles[fieldName];
    return file ? file.name : null;
  }
} 