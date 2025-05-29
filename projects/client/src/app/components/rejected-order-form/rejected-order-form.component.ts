import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-rejected-order-form',
  templateUrl: './rejected-order-form.component.html',
  styleUrls: ['./rejected-order-form.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule],
  encapsulation: ViewEncapsulation.None
})
export class RejectedOrderFormComponent implements OnInit {
  formId: string | null = null;
  rejectedOrderForm: FormGroup;
  submitting = false;
  currentDate = new Date();
  currentTime = this.formatTime(new Date());
  driverName = '';
  driverId = '';
  isViewMode = false;
  formAssignment: any = null;
  completedFormData: any = null;
  completedDate: string | null = null;
  progressSaved = false;
  sectionErrors: string[] = [];
  showSectionErrors = false;
  
  // Store selection properties
  storeSearchTerm: string = '';
  filteredStores: any[] = [];
  storesList: any[] = [];
  selectedStore: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private supabaseService: SupabaseService
  ) {
    this.rejectedOrderForm = this.fb.group({
      driver_name: [this.driverName, Validators.required],
      date: [this.formatDate(this.currentDate), Validators.required],
      route_number: ['', Validators.required],
      van_registration: ['', Validators.required],
      store_name: ['', Validators.required],
      store_id: [''],
      arrival_time_at_store: ['', Validators.required],
      wait_time_in_store: ['', Validators.required],
      site_keys: ['', Validators.required],
      driving_start_time: ['', Validators.required],
      drop_number_on_route: ['', [Validators.required, Validators.pattern('[0-9]*')]],
      number_of_crates_into_store: ['', [Validators.required, Validators.pattern('[0-9]*')]],
      van_temp_by_display: ['', [Validators.required, Validators.pattern('[0-9]*\.?[0-9]*')]],
      order_damaged_before_loading: ['', Validators.required],
      all_products_damaged: ['', Validators.required],
      marked_shortages_on_docket: ['', Validators.required],
      know_how_product_damaged: ['', Validators.required],
      comments_vehicle_issues: [''],
      comments_delivery_issues: [''],
      comments_complaints: [''],
      comments_returns: [''],
      comments_accidents: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    this.formId = this.route.snapshot.paramMap.get('id');
    
    // Get driver info from localStorage
    const loggedInDriverStr = localStorage.getItem('loggedInDriver');
    if (loggedInDriverStr) {
      try {
        const driver = JSON.parse(loggedInDriverStr);
        this.driverId = driver.id;
        this.driverName = driver.name;
        this.rejectedOrderForm.patchValue({ driver_name: this.driverName });
      } catch (e) {
        console.error('Error parsing logged in driver data', e);
        this.router.navigate(['/login']);
        return;
      }
    } else {
      this.router.navigate(['/login']);
      return;
    }
    
    // Load stores for selection
    await this.fetchAllStores();
    
    // If formId is provided, try to load existing rejected order for viewing
    if (this.formId) {
      await this.loadExistingRejectedOrder();
    } else {
      // Check for saved draft if creating new form
      this.loadSavedDraft();
    }
    
    // Clear section errors when form values change
    this.rejectedOrderForm.valueChanges.subscribe(() => {
      if (this.showSectionErrors) {
        this.showSectionErrors = false;
        this.sectionErrors = [];
      }
    });
  }

  async fetchAllStores(): Promise<void> {
    try {
      const stores = await this.supabaseService.getAllStores();
      if (stores && stores.length > 0) {
        this.storesList = stores.map(store => ({
          id: store.id,
          code: store.store_code || store.dispatch_code,
          name: store.dispatch_store_name || store.store_name,
          data: store
        }));
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  }

  onStoreSearchInput(): void {
    if (this.storeSearchTerm.length > 0) {
      const term = this.storeSearchTerm.toLowerCase();
      this.filteredStores = this.storesList
        .filter(store => 
          (store.code && store.code.toLowerCase().includes(term)) || 
          (store.name && store.name.toLowerCase().includes(term))
        )
        .slice(0, 10);
    } else {
      this.filteredStores = [];
    }
  }

  selectStore(store: any): void {
    this.selectedStore = store;
    this.storeSearchTerm = `${store.code} - ${store.name}`;
    this.filteredStores = [];
    this.rejectedOrderForm.patchValue({
      store_name: `${store.code} - ${store.name}`,
      store_id: store.id
    });
  }

  async loadExistingRejectedOrder(): Promise<void> {
    if (!this.formId) return;
    
    try {
      const rejectedOrder = await this.supabaseService.getRejectedOrderById(this.formId);
      
      if (rejectedOrder) {
        this.isViewMode = true;
        this.completedFormData = rejectedOrder;
        this.completedDate = rejectedOrder.created_at;
        
        // Populate form with existing data
        this.rejectedOrderForm.patchValue({
          driver_name: rejectedOrder.driver_name || this.driverName,
          date: rejectedOrder.date || '',
          route_number: rejectedOrder.route_number || '',
          van_registration: rejectedOrder.van_registration || '',
          store_name: rejectedOrder.store_name || '',
          store_id: rejectedOrder.store_id || '',
          arrival_time_at_store: rejectedOrder.arrival_time_at_store || '',
          wait_time_in_store: rejectedOrder.wait_time_in_store || '',
          site_keys: rejectedOrder.site_keys || '',
          driving_start_time: rejectedOrder.driving_start_time || '',
          drop_number_on_route: rejectedOrder.drop_number_on_route || '',
          number_of_crates_into_store: rejectedOrder.number_of_crates_into_store || '',
          van_temp_by_display: rejectedOrder.van_temp_by_display || '',
          order_damaged_before_loading: rejectedOrder.order_damaged_before_loading || '',
          all_products_damaged: rejectedOrder.all_products_damaged || '',
          marked_shortages_on_docket: rejectedOrder.marked_shortages_on_docket || '',
          know_how_product_damaged: rejectedOrder.know_how_product_damaged || '',
          comments_vehicle_issues: rejectedOrder.comments_vehicle_issues || '',
          comments_delivery_issues: rejectedOrder.comments_delivery_issues || '',
          comments_complaints: rejectedOrder.comments_complaints || '',
          comments_returns: rejectedOrder.comments_returns || '',
          comments_accidents: rejectedOrder.comments_accidents || ''
        });
        
        // Update store search term if store name exists
        if (rejectedOrder.store_name) {
          this.storeSearchTerm = rejectedOrder.store_name;
        }
        
        // Disable form in view mode
        this.rejectedOrderForm.disable();
      }
    } catch (error) {
      console.error('Error loading rejected order:', error);
      // If not found, continue with new form creation
    }
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  validateSections(): string[] {
    const errors: string[] = [];
    const formValues = this.rejectedOrderForm.value;

    // Basic Information validation
    if (!formValues.driver_name || !formValues.date || !formValues.route_number || 
        !formValues.van_registration || !formValues.store_name) {
      errors.push('Basic Information - Please complete all required fields');
    }

    // Delivery Information validation
    if (!formValues.arrival_time_at_store || !formValues.wait_time_in_store || 
        !formValues.site_keys || !formValues.driving_start_time || 
        !formValues.drop_number_on_route || !formValues.number_of_crates_into_store || 
        !formValues.van_temp_by_display) {
      errors.push('Delivery Information - Please complete all required fields');
    }

    // Damage Assessment validation
    if (!formValues.order_damaged_before_loading || !formValues.all_products_damaged || 
        !formValues.marked_shortages_on_docket || !formValues.know_how_product_damaged) {
      errors.push('Damage Assessment - Please complete all required fields');
    }

    return errors;
  }

  async saveProgress(): Promise<void> {
    // For standalone rejected orders, we'll save as a draft in localStorage
    const formData = {
      ...this.rejectedOrderForm.value,
      driver_id: this.driverId,
      saved_at: new Date().toISOString()
    };

    try {
      localStorage.setItem('rejected_order_draft', JSON.stringify(formData));
      this.progressSaved = true;
      setTimeout(() => {
        this.progressSaved = false;
      }, 3000);
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  }

  async submitForm(): Promise<void> {
    this.sectionErrors = this.validateSections();
    
    if (this.sectionErrors.length > 0) {
      this.showSectionErrors = true;
      window.scrollTo(0, 0);
      return;
    }

    this.submitting = true;

    const formData = {
      ...this.rejectedOrderForm.value,
      driver_id: this.driverId
    };

    try {
      const result = await this.supabaseService.submitRejectedOrder(formData);
      
      if (result) {
        // Clear any saved draft
        localStorage.removeItem('rejected_order_draft');
        // Navigate back to driver forms with success message
        this.router.navigate(['/driver-forms'], { queryParams: { success: 'true' } });
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('There was an error submitting your form. Please try again.');
    } finally {
      this.submitting = false;
    }
  }

  async forceSubmitForm(): Promise<void> {
    if (this.rejectedOrderForm.invalid) {
      this.rejectedOrderForm.markAllAsTouched();
      this.sectionErrors = this.validateSections();
      this.showSectionErrors = true;
      window.scrollTo(0, 0);
      return;
    }

    await this.submitForm();
  }

  loadSavedDraft(): void {
    try {
      const savedDraft = localStorage.getItem('rejected_order_draft');
      if (savedDraft) {
        const draftData = JSON.parse(savedDraft);
        // Only load if it's for the same driver
        if (draftData.driver_id === this.driverId) {
          this.rejectedOrderForm.patchValue(draftData);
          
          // Restore store search term if available
          if (draftData.store_name) {
            this.storeSearchTerm = draftData.store_name;
          }
          
          console.log('Loaded saved draft from:', draftData.saved_at);
        }
      }
    } catch (error) {
      console.error('Error loading saved draft:', error);
      // Remove corrupted draft
      localStorage.removeItem('rejected_order_draft');
    }
  }
} 