import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-driver-forms',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './driver-forms.component.html',
  styleUrls: ['./driver-forms.component.scss']
})
export class DriverFormsComponent implements OnInit {
  driverForm: FormGroup;
  driverName: string = '';
  currentDate: Date = new Date();
  isSubmitting = false;
  showFuelFields = false;
  showDocketIssueField = false;
  
  constructor(
    private fb: FormBuilder,
    private router: Router
  ) {
    this.driverForm = this.fb.group({
      driverName: [{value: '', disabled: true}],
      date: [{value: '', disabled: true}],
      vanRegistration: ['', Validators.required],
      startingMileage: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      fuelAdded: [false],
      fuelLitresAdded: [''],
      fuelCardReg: [''],
      hasFullUniform: [false],
      hasAllSiteKeys: [false],
      workStartTime: ['', Validators.required],
      preloadVanTemperature: [''],
      preloadProductTemperatureProbe: [''],
      allAuxiliaryProductsOnBoard: [false],
      cratesOut: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      vanProbeSerialNumber: [''],
      issuesWithDockets: [false],
      docketIssuesReason: ['']
    });
  }

  ngOnInit(): void {
    // Get driver name from localStorage
    const savedDriverData = localStorage.getItem('loggedInDriver');
    if (savedDriverData) {
      try {
        const driverData = JSON.parse(savedDriverData);
        if (driverData && driverData.name) {
          this.driverName = driverData.name;
          this.driverForm.patchValue({
            driverName: this.driverName,
            date: this.formatDate(this.currentDate)
          });
        }
      } catch (e) {
        console.error('Error parsing saved driver data', e);
      }
    }
    
    // If no driver name, redirect to login
    if (!this.driverName) {
      this.router.navigate(['/login']);
    }

    // Set up form value change listeners
    this.driverForm.get('fuelAdded')?.valueChanges.subscribe(value => {
      this.showFuelFields = value;
      
      if (value) {
        this.driverForm.get('fuelLitresAdded')?.setValidators([Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)]);
        this.driverForm.get('fuelCardReg')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('fuelLitresAdded')?.clearValidators();
        this.driverForm.get('fuelCardReg')?.clearValidators();
      }
      
      this.driverForm.get('fuelLitresAdded')?.updateValueAndValidity();
      this.driverForm.get('fuelCardReg')?.updateValueAndValidity();
    });

    this.driverForm.get('issuesWithDockets')?.valueChanges.subscribe(value => {
      this.showDocketIssueField = value;
      
      if (value) {
        this.driverForm.get('docketIssuesReason')?.setValidators([Validators.required]);
      } else {
        this.driverForm.get('docketIssuesReason')?.clearValidators();
      }
      
      this.driverForm.get('docketIssuesReason')?.updateValueAndValidity();
    });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  onSubmit(): void {
    if (this.driverForm.valid) {
      this.isSubmitting = true;
      
      // Prepare form data
      const formData = {
        ...this.driverForm.getRawValue(),
        submissionDate: new Date().toISOString()
      };
      
      // TODO: Submit form data to your backend API
      console.log('Form submitted:', formData);
      
      // Mock successful submission
      setTimeout(() => {
        this.isSubmitting = false;
        alert('Form submitted successfully!');
        this.router.navigate(['/dashboard']);
      }, 1000);
    } else {
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.driverForm.controls).forEach(key => {
        const control = this.driverForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
} 