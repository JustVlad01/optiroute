import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-form-details',
  templateUrl: './form-details.component.html',
  styleUrls: ['./form-details.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule]
})
export class FormDetailsComponent implements OnInit {
  formId: string | null = null;
  driverForm: FormGroup;
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
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private supabaseService: SupabaseService
  ) {
    this.driverForm = this.fb.group({
      date: [this.formatDate(this.currentDate), Validators.required],
      time: [this.currentTime, Validators.required],
      van_registration: ['', Validators.required],
      starting_mileage: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      fuel_added: [false],
      litres_added: [''],
      fuel_card_reg: [''],
      full_uniform: [false, Validators.required],
      all_site_keys: [false, Validators.required],
      work_start_time: [this.currentTime, Validators.required],
      preload_van_temp: [''],
      preload_product_temp: [''],
      auxiliary_products: [false, Validators.required],
      number_of_crates_out: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      van_probe_serial_number: [''],
      paperwork_issues: [false],
      paperwork_issues_reason: [''],
      orders_products_issues: [false],
      orders_products_issues_reason: [''],
      site_issues: [false],
      site_issues_reason: [''],
      customer_complaints: [false],
      customer_complaints_reason: [''],
      product_complaints: [false],
      product_complaints_reason: [''],
      closing_mileage: ['', [Validators.pattern('^[0-9]*$')]],
      recycled_all_returns: [false],
      van_fridge_working: [false],
      returned_van_probe: [false],
      cab_cleaned: [false],
      cab_not_cleaned_reason: [''],
      chemicals_used: [''],
      has_van_issues: [false],
      van_issues: [''],
      has_repairs_needed: [false],
      repairs_needed: [''],
      number_of_crates_in: ['', [Validators.pattern('^[0-9]*$')]]
    });
  }

  async ngOnInit(): Promise<void> {
    this.formId = this.route.snapshot.paramMap.get('id');
    
    // Get driver info from localStorage instead of session
    const loggedInDriverStr = localStorage.getItem('loggedInDriver');
    if (loggedInDriverStr) {
      try {
        const driver = JSON.parse(loggedInDriverStr);
        this.driverId = driver.id;
        this.driverName = driver.name;
      } catch (e) {
        console.error('Error parsing logged in driver data', e);
        // Redirect to login if driver data is invalid
        this.router.navigate(['/login']);
        return;
      }
    } else {
      // No logged in driver, redirect to login
      this.router.navigate(['/login']);
      return;
    }
    
    if (this.formId) {
      // Check if this form has been completed
      await this.checkFormStatus();
    }
    
    // Add conditional validation
    this.driverForm.get('fuel_added')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('litres_added')?.setValidators([Validators.required]);
        this.driverForm.get('fuel_card_reg')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('litres_added')?.clearValidators();
        this.driverForm.get('fuel_card_reg')?.clearValidators();
      }
      this.driverForm.get('litres_added')?.updateValueAndValidity();
      this.driverForm.get('fuel_card_reg')?.updateValueAndValidity();
    });
    
    this.driverForm.get('paperwork_issues')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('paperwork_issues_reason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('paperwork_issues_reason')?.clearValidators();
      }
      this.driverForm.get('paperwork_issues_reason')?.updateValueAndValidity();
    });
    
    this.driverForm.get('orders_products_issues')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('orders_products_issues_reason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('orders_products_issues_reason')?.clearValidators();
      }
      this.driverForm.get('orders_products_issues_reason')?.updateValueAndValidity();
    });
    
    this.driverForm.get('site_issues')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('site_issues_reason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('site_issues_reason')?.clearValidators();
      }
      this.driverForm.get('site_issues_reason')?.updateValueAndValidity();
    });
    
    this.driverForm.get('customer_complaints')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('customer_complaints_reason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('customer_complaints_reason')?.clearValidators();
      }
      this.driverForm.get('customer_complaints_reason')?.updateValueAndValidity();
    });
    
    this.driverForm.get('product_complaints')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('product_complaints_reason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('product_complaints_reason')?.clearValidators();
      }
      this.driverForm.get('product_complaints_reason')?.updateValueAndValidity();
    });
    
    // New conditional validation for cab not cleaned reason
    this.driverForm.get('cab_cleaned')?.valueChanges.subscribe(value => {
      if (!value) {
        this.driverForm.get('cab_not_cleaned_reason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('cab_not_cleaned_reason')?.clearValidators();
      }
      this.driverForm.get('cab_not_cleaned_reason')?.updateValueAndValidity();
    });
    
    // Add validation for van issues when has_van_issues is true
    this.driverForm.get('has_van_issues')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('van_issues')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('van_issues')?.clearValidators();
      }
      this.driverForm.get('van_issues')?.updateValueAndValidity();
    });
    
    // Add validation for repairs needed when has_repairs_needed is true
    this.driverForm.get('has_repairs_needed')?.valueChanges.subscribe(value => {
      if (value) {
        this.driverForm.get('repairs_needed')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('repairs_needed')?.clearValidators();
      }
      this.driverForm.get('repairs_needed')?.updateValueAndValidity();
    });
  }

  async checkFormStatus(): Promise<void> {
    if (!this.formId) return;
    
    // Check if form has been completed in Supabase
    const assignment = await this.supabaseService.getFormAssignmentById(this.formId);
    
    if (assignment) {
      this.formAssignment = assignment;
      
      if (assignment.status === 'completed' && 
         (assignment.driver_id === this.driverId || !assignment.driver_id)) {
        this.isViewMode = true;
        this.completedDate = assignment.completed_at;
        await this.loadCompletedFormData(assignment.form_id);
      } else if (assignment.partially_completed && assignment.partial_form_data) {
        // Load partial form data if it exists
        console.log('Loading partial form data:', assignment.partial_form_data);
        this.driverForm.patchValue(assignment.partial_form_data);
      }
    }
  }

  async loadCompletedFormData(formId: string): Promise<void> {
    if (!formId) return;
    
    // Load the completed form data from Supabase
    const completedForm = await this.supabaseService.getDriverFormById(formId);
    
    if (completedForm) {
      this.completedFormData = completedForm;
      
      // Populate the form with saved data
      this.driverForm.patchValue({
        date: completedForm.date,
        time: completedForm.time,
        van_registration: completedForm.van_registration,
        starting_mileage: completedForm.starting_mileage,
        fuel_added: completedForm.fuel_added,
        litres_added: completedForm.litres_added,
        fuel_card_reg: completedForm.fuel_card_reg,
        full_uniform: completedForm.full_uniform,
        all_site_keys: completedForm.all_site_keys,
        work_start_time: completedForm.work_start_time,
        preload_van_temp: completedForm.preload_van_temp,
        preload_product_temp: completedForm.preload_product_temp,
        auxiliary_products: completedForm.auxiliary_products,
        number_of_crates_out: completedForm.number_of_crates_out,
        van_probe_serial_number: completedForm.van_probe_serial_number,
        paperwork_issues: completedForm.paperwork_issues,
        paperwork_issues_reason: completedForm.paperwork_issues_reason,
        orders_products_issues: completedForm.orders_products_issues,
        orders_products_issues_reason: completedForm.orders_products_issues_reason,
        site_issues: completedForm.site_issues,
        site_issues_reason: completedForm.site_issues_reason,
        customer_complaints: completedForm.customer_complaints,
        customer_complaints_reason: completedForm.customer_complaints_reason,
        product_complaints: completedForm.product_complaints,
        product_complaints_reason: completedForm.product_complaints_reason,
        closing_mileage: completedForm.closing_mileage,
        recycled_all_returns: completedForm.recycled_all_returns,
        van_fridge_working: completedForm.van_fridge_working,
        returned_van_probe: completedForm.returned_van_probe,
        cab_cleaned: completedForm.cab_cleaned,
        cab_not_cleaned_reason: completedForm.cab_not_cleaned_reason,
        chemicals_used: completedForm.chemicals_used,
        has_van_issues: completedForm.has_van_issues || !!completedForm.van_issues,
        van_issues: completedForm.van_issues,
        has_repairs_needed: completedForm.has_repairs_needed || !!completedForm.repairs_needed,
        repairs_needed: completedForm.repairs_needed,
        number_of_crates_in: completedForm.number_of_crates_in
      });
      
      // Disable the form when in view mode
      this.driverForm.disable();
    }
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  checkIfNeedsReview(formValues: any): boolean {
    // Form needs review if any of these fields have content
    return !!(
      (formValues.paperwork_issues && formValues.paperwork_issues_reason?.trim()) || 
      (formValues.orders_products_issues && formValues.orders_products_issues_reason?.trim()) || 
      (formValues.site_issues && formValues.site_issues_reason?.trim()) || 
      (formValues.customer_complaints && formValues.customer_complaints_reason?.trim()) || 
      (formValues.product_complaints && formValues.product_complaints_reason?.trim()) || 
      (formValues.has_van_issues && formValues.van_issues?.trim()) || 
      (formValues.has_repairs_needed && formValues.repairs_needed?.trim()) ||
      !formValues.van_fridge_working ||
      (!formValues.cab_cleaned && formValues.cab_not_cleaned_reason?.trim())
    );
  }

  async submitForm(): Promise<void> {
    console.log('Form validation state:', this.driverForm.valid);
    console.log('Form values:', this.driverForm.value);
    console.log('Form controls:', Object.keys(this.driverForm.controls).map(key => {
      const control = this.driverForm.get(key);
      return {
        key,
        value: control?.value,
        valid: control?.valid,
        errors: control?.errors
      };
    }));
    
    if (this.driverForm.valid) {
      this.submitting = true;
      
      // Get form values
      const formValues = this.driverForm.value;
      
      // Check if form needs review (has issues that admin should check)
      const needsReview = this.checkIfNeedsReview(formValues);
      
      // Create the final form data with default values for required fields
      const formData = {
        driver_name: this.driverName,
        date: formValues.date || this.formatDate(this.currentDate),
        time: formValues.time || this.currentTime,
        van_registration: formValues.van_registration || '',
        starting_mileage: formValues.starting_mileage || 0,
        fuel_added: formValues.fuel_added || false,
        litres_added: formValues.fuel_added ? (formValues.litres_added || 0) : null,
        fuel_card_reg: formValues.fuel_added ? (formValues.fuel_card_reg || '') : null,
        full_uniform: formValues.full_uniform || false,
        all_site_keys: formValues.all_site_keys || false,
        work_start_time: formValues.work_start_time || this.currentTime,
        preload_van_temp: formValues.preload_van_temp || 0,
        preload_product_temp: formValues.preload_product_temp || 0,
        auxiliary_products: formValues.auxiliary_products || false,
        number_of_crates_out: formValues.number_of_crates_out || 0,
        van_probe_serial_number: formValues.van_probe_serial_number || null,
        paperwork_issues: formValues.paperwork_issues || false,
        paperwork_issues_reason: formValues.paperwork_issues ? (formValues.paperwork_issues_reason || '') : null,
        orders_products_issues: formValues.orders_products_issues || false,
        orders_products_issues_reason: formValues.orders_products_issues ? (formValues.orders_products_issues_reason || '') : null,
        site_issues: formValues.site_issues || false,
        site_issues_reason: formValues.site_issues ? (formValues.site_issues_reason || '') : null,
        customer_complaints: formValues.customer_complaints || false,
        customer_complaints_reason: formValues.customer_complaints ? (formValues.customer_complaints_reason || '') : null,
        product_complaints: formValues.product_complaints || false,
        product_complaints_reason: formValues.product_complaints ? (formValues.product_complaints_reason || '') : null,
        closing_mileage: formValues.closing_mileage || null,
        recycled_all_returns: formValues.recycled_all_returns || false,
        van_fridge_working: formValues.van_fridge_working || false,
        returned_van_probe: formValues.returned_van_probe || false,
        cab_cleaned: formValues.cab_cleaned || false,
        cab_not_cleaned_reason: !formValues.cab_cleaned ? (formValues.cab_not_cleaned_reason || '') : null,
        chemicals_used: formValues.chemicals_used || null,
        has_van_issues: formValues.has_van_issues || false,
        van_issues: formValues.has_van_issues ? (formValues.van_issues || '') : null,
        has_repairs_needed: formValues.has_repairs_needed || false,
        repairs_needed: formValues.has_repairs_needed ? (formValues.repairs_needed || '') : null,
        number_of_crates_in: formValues.number_of_crates_in || null,
        needs_review: needsReview
      };
      
      console.log('Submitting form with data:', formData);
      
      try {
        // Submit the form data to Supabase
        const submittedForm = await this.supabaseService.submitDriverForm(formData);
        
        if (submittedForm && this.formId) {
          console.log('Form submitted successfully:', submittedForm);
          // Update the form assignment status to completed
          await this.supabaseService.updateFormAssignmentStatus(this.formId, 'completed', submittedForm[0].id);
          
          this.submitting = false;
          this.router.navigate(['/driver-forms'], { 
            queryParams: { success: true } 
          });
        } else {
          throw new Error('Form submission failed');
        }
      } catch (error) {
        console.error('Error submitting form:', error);
        alert('An error occurred while submitting the form. Please try again.');
        this.submitting = false;
      }
    } else {
      console.error('Form is invalid - marking fields as touched to show errors');
      // Mark all fields as touched to show validation errors
      Object.keys(this.driverForm.controls).forEach(key => {
        const control = this.driverForm.get(key);
        control?.markAsTouched();
      });
    }
  }
  
  async saveProgress(): Promise<void> {
    if (!this.formId) {
      alert('Error: No form ID found. Please try again later.');
      return;
    }
    
    // Save the current form state
    const result = await this.supabaseService.savePartialFormData(this.formId, this.driverForm.value);
    
    if (result) {
      this.progressSaved = true;
      // Hide the success message after 5 seconds
      setTimeout(() => {
        this.progressSaved = false;
      }, 5000);
    } else {
      alert('Error saving form. Please try again.');
    }
  }
} 