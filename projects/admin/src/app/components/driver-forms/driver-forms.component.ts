import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-driver-forms',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './driver-forms.component.html',
  styleUrls: ['./driver-forms.component.scss']
})
export class DriverFormsComponent implements OnInit {
  driverForm!: FormGroup;
  currentDate = new Date();
  driverName = 'Test Driver';
  fuelAdded = false;
  isViewMode = false;
  formId: string | null = null;
  completedForm: any = null;
  problemFields: string[] = [];
  partialSaved = false;
  assignmentId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    this.initForm();
    
    // Check if we're in view mode
    this.formId = this.route.snapshot.paramMap.get('id');
    
    // Check if we have an assignment ID in the URL params
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId');
    
    if (this.formId) {
      this.isViewMode = true;
      this.loadFormData(this.formId);
    } else if (this.assignmentId) {
      // Load partial form data if it exists
      this.loadPartialFormData(this.assignmentId);
    }
  }

  async loadPartialFormData(assignmentId: string): Promise<void> {
    try {
      const assignment = await this.supabaseService.getFormAssignmentById(assignmentId);
      if (assignment && assignment.partial_form_data) {
        this.driverForm.patchValue(assignment.partial_form_data);
      }
    } catch (error) {
      console.error('Error loading partial form data:', error);
    }
  }

  async loadFormData(formId: string): Promise<void> {
    try {
      const formData = await this.supabaseService.getDriverFormById(formId);
      if (formData) {
        this.completedForm = formData;
        this.driverName = formData.driver_name;
        
        // Detect problem fields that triggered needs_review
        this.detectProblemFields(formData);
        
        // Populate the form with the data
        this.driverForm.patchValue({
          driverName: formData.driver_name,
          date: formData.date,
          time: formData.time,
          vanRegistration: formData.van_registration,
          startingMileage: formData.starting_mileage,
          fuelAdded: formData.fuel_added,
          litresAdded: formData.litres_added,
          fuelCardReg: formData.fuel_card_reg,
          fullUniform: formData.full_uniform,
          allSiteKeys: formData.all_site_keys,
          workStartTime: formData.work_start_time,
          preloadVanTemp: formData.preload_van_temp,
          preloadProductTemp: formData.preload_product_temp,
          auxiliaryProducts: formData.auxiliary_products,
          numberOfCratesOut: formData.number_of_crates_out,
          vanProbeSerialNumber: formData.van_probe_serial_number,
          paperworkIssues: formData.paperwork_issues,
          paperworkIssuesReason: formData.paperwork_issues_reason,
          ordersProductsIssues: formData.orders_products_issues,
          ordersProductsIssuesReason: formData.orders_products_issues_reason,
          siteIssues: formData.site_issues,
          siteIssuesReason: formData.site_issues_reason,
          customerComplaints: formData.customer_complaints,
          customerComplaintsReason: formData.customer_complaints_reason,
          productComplaints: formData.product_complaints,
          productComplaintsReason: formData.product_complaints_reason,
          closingMileage: formData.closing_mileage,
          recycledAllReturns: formData.recycled_all_returns,
          vanFridgeWorking: formData.van_fridge_working,
          returnedVanProbe: formData.returned_van_probe,
          cabCleaned: formData.cab_cleaned,
          cabNotCleanedReason: formData.cab_not_cleaned_reason,
          chemicalsUsed: formData.chemicals_used,
          vanIssues: formData.van_issues,
          repairsNeeded: formData.repairs_needed,
          numberOfCratesIn: formData.number_of_crates_in
        });
        
        // Disable the form when in view mode
        this.driverForm.disable();
      } else {
        console.error('Form not found');
        this.router.navigate(['/form-assignments']);
      }
    } catch (error) {
      console.error('Error loading form data:', error);
      this.router.navigate(['/form-assignments']);
    }
  }

  detectProblemFields(formData: any): void {
    this.problemFields = [];
    
    // Check for issues that would have triggered the needs_review flag
    if (formData.paperwork_issues && formData.paperwork_issues_reason?.trim()) {
      this.problemFields.push('paperworkIssuesReason');
    }
    
    if (formData.orders_products_issues && formData.orders_products_issues_reason?.trim()) {
      this.problemFields.push('ordersProductsIssuesReason');
    }
    
    if (formData.site_issues && formData.site_issues_reason?.trim()) {
      this.problemFields.push('siteIssuesReason');
    }
    
    if (formData.customer_complaints && formData.customer_complaints_reason?.trim()) {
      this.problemFields.push('customerComplaintsReason');
    }
    
    if (formData.product_complaints && formData.product_complaints_reason?.trim()) {
      this.problemFields.push('productComplaintsReason');
    }
    
    if (formData.van_issues?.trim()) {
      this.problemFields.push('vanIssues');
    }
    
    if (formData.repairs_needed?.trim()) {
      this.problemFields.push('repairsNeeded');
    }
    
    if (!formData.van_fridge_working) {
      this.problemFields.push('vanFridgeWorking');
    }
    
    if (!formData.cab_cleaned && formData.cab_not_cleaned_reason?.trim()) {
      this.problemFields.push('cabCleaned');
      this.problemFields.push('cabNotCleanedReason');
    }
  }

  isFieldProblem(fieldName: string): boolean {
    return this.problemFields.includes(fieldName);
  }

  initForm(): void {
    this.driverForm = this.fb.group({
      driverName: [this.driverName, Validators.required],
      date: [this.formatDate(this.currentDate), Validators.required],
      time: [this.formatTime(this.currentDate), Validators.required],
      vanRegistration: ['', Validators.required],
      startingMileage: ['', Validators.required],
      fuelAdded: [false],
      litresAdded: [''],
      fuelCardReg: [''],
      fullUniform: [false],
      allSiteKeys: [false],
      workStartTime: ['', Validators.required],
      preloadVanTemp: [''],
      preloadProductTemp: [''],
      auxiliaryProducts: [false],
      numberOfCratesOut: ['', Validators.required],
      vanProbeSerialNumber: [''],
      paperworkIssues: [false],
      paperworkIssuesReason: [''],
      ordersProductsIssues: [false],
      ordersProductsIssuesReason: [''],
      siteIssues: [false],
      siteIssuesReason: [''],
      customerComplaints: [false],
      customerComplaintsReason: [''],
      productComplaints: [false],
      productComplaintsReason: [''],
      // New end of shift fields
      closingMileage: [''],
      recycledAllReturns: [false],
      vanFridgeWorking: [false],
      returnedVanProbe: [false],
      cabCleaned: [false],
      cabNotCleanedReason: [''],
      chemicalsUsed: [''],
      vanIssues: [''],
      repairsNeeded: [''],
      numberOfCratesIn: ['']
    });

    // Add conditional validation
    this.driverForm.get('fuelAdded')?.valueChanges.subscribe(value => {
      const litresControl = this.driverForm.get('litresAdded');
      const fuelCardControl = this.driverForm.get('fuelCardReg');
      
      if (value) {
        litresControl?.setValidators([Validators.required]);
        fuelCardControl?.setValidators([Validators.required]);
      } else {
        litresControl?.clearValidators();
        fuelCardControl?.clearValidators();
      }
      
      litresControl?.updateValueAndValidity();
      fuelCardControl?.updateValueAndValidity();
    });

    this.driverForm.get('paperworkIssues')?.valueChanges.subscribe(value => {
      const reasonControl = this.driverForm.get('paperworkIssuesReason');
      
      if (value) {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      
      reasonControl?.updateValueAndValidity();
    });
    
    this.driverForm.get('ordersProductsIssues')?.valueChanges.subscribe(value => {
      const reasonControl = this.driverForm.get('ordersProductsIssuesReason');
      
      if (value) {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      
      reasonControl?.updateValueAndValidity();
    });
    
    this.driverForm.get('siteIssues')?.valueChanges.subscribe(value => {
      const reasonControl = this.driverForm.get('siteIssuesReason');
      
      if (value) {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      
      reasonControl?.updateValueAndValidity();
    });
    
    this.driverForm.get('customerComplaints')?.valueChanges.subscribe(value => {
      const reasonControl = this.driverForm.get('customerComplaintsReason');
      
      if (value) {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      
      reasonControl?.updateValueAndValidity();
    });
    
    this.driverForm.get('productComplaints')?.valueChanges.subscribe(value => {
      const reasonControl = this.driverForm.get('productComplaintsReason');
      
      if (value) {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      
      reasonControl?.updateValueAndValidity();
    });
    
    this.driverForm.get('cabCleaned')?.valueChanges.subscribe(value => {
      const reasonControl = this.driverForm.get('cabNotCleanedReason');
      
      if (!value) {
        reasonControl?.setValidators([Validators.required]);
      } else {
        reasonControl?.clearValidators();
      }
      
      reasonControl?.updateValueAndValidity();
    });
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  formatTime(date: Date): string {
    return date.toTimeString().split(' ')[0].substring(0, 5);
  }

  savePartialForm(): void {
    if (!this.assignmentId) {
      alert('No assignment ID found. Cannot save partial form.');
      return;
    }
    
    // Validate only the required fields for the initial section
    const initialRequired = ['vanRegistration', 'startingMileage', 'workStartTime', 'numberOfCratesOut'];
    const validInitialSection = initialRequired.every(field => this.driverForm.get(field)?.valid);
    
    if (!validInitialSection) {
      // Mark only the required fields as touched
      initialRequired.forEach(field => {
        this.driverForm.get(field)?.markAsTouched();
      });
      
      alert('Please fill out all required fields in the initial sections.');
      return;
    }
    
    // Save the partial form data
    this.supabaseService.savePartialFormData(this.assignmentId, this.driverForm.value)
      .then(response => {
        if (response) {
          this.partialSaved = true;
          // Reset the message after a few seconds
          setTimeout(() => {
            this.partialSaved = false;
          }, 5000);
        } else {
          alert('Error saving form. Please try again.');
        }
      });
  }

  onSubmit(): void {
    if (this.driverForm.valid) {
      // Check for conditions that would set the needs_review flag
      const formValues = this.driverForm.value;
      const needsReview = this.checkIfNeedsReview(formValues);
      
      // Add the needs_review flag to the form data
      const formData = {
        ...formValues,
        needs_review: needsReview
      };
      
      this.supabaseService.submitDriverForm(formData)
        .then(response => {
          if (response) {
            // If we have an assignment ID, update its status to completed
            if (this.assignmentId) {
              this.supabaseService.updateFormAssignmentStatus(this.assignmentId, 'completed', response[0].id)
                .then(() => {
                  alert('Form submitted successfully!');
                  this.router.navigate(['/dashboard']);
                });
            } else {
              alert('Form submitted successfully!');
              this.router.navigate(['/dashboard']);
            }
          } else {
            alert('Error submitting form. Please try again.');
          }
        });
    } else {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.driverForm.controls).forEach(key => {
        this.driverForm.get(key)?.markAsTouched();
      });
    }
  }

  checkIfNeedsReview(formValues: any): boolean {
    // Check for conditions that would require review
    return (
      (formValues.paperworkIssues && formValues.paperworkIssuesReason?.trim()) ||
      (formValues.ordersProductsIssues && formValues.ordersProductsIssuesReason?.trim()) ||
      (formValues.siteIssues && formValues.siteIssuesReason?.trim()) ||
      (formValues.customerComplaints && formValues.customerComplaintsReason?.trim()) ||
      (formValues.productComplaints && formValues.productComplaintsReason?.trim()) ||
      (formValues.vanIssues?.trim()) ||
      (formValues.repairsNeeded?.trim()) ||
      (!formValues.vanFridgeWorking) ||
      (!formValues.cabCleaned && formValues.cabNotCleanedReason?.trim())
    );
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  navigateBack(): void {
    this.router.navigate(['/form-assignments']);
  }
} 