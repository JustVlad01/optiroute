import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-driver-form-fill',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './driver-form-fill.component.html',
  styleUrls: ['./driver-form-fill.component.scss']
})
export class DriverFormFillComponent implements OnInit {
  driverForm!: FormGroup;
  currentDate = new Date();
  driverName = 'Test Driver'; // This would come from authentication in a real app
  driverId = ''; // This would come from authentication in a real app
  assignmentId = '';
  assignment: any = null;
  isLoading = true;
  fuelAdded = false;
  paperworkIssues = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    this.assignmentId = this.route.snapshot.paramMap.get('id') || '';
    
    if (!this.assignmentId) {
      this.router.navigate(['/driver']);
      return;
    }
    
    // In a real app, you would get the driver info from authentication
    this.supabaseService.getAllDrivers().then(drivers => {
      if (drivers && drivers.length > 0) {
        this.driverId = drivers[0].id;
        this.driverName = drivers[0].name;
        this.loadAssignment();
      } else {
        this.isLoading = false;
        console.error('No drivers found');
      }
    });
  }

  loadAssignment(): void {
    // In a real app, you would validate that the assignment belongs to the authenticated driver
    this.supabaseService.getDriverFormAssignments(this.driverId).then(assignments => {
      const matchingAssignment = assignments?.find(a => a.id === this.assignmentId);
      
      if (matchingAssignment) {
        this.assignment = matchingAssignment;
        this.initForm();
      } else {
        this.router.navigate(['/driver']);
      }
      
      this.isLoading = false;
    });
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
      paperworkIssuesReason: ['']
    });

    // Add conditional validation
    this.driverForm.get('fuelAdded')?.valueChanges.subscribe(value => {
      this.fuelAdded = value;
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
      this.paperworkIssues = value;
      const reasonControl = this.driverForm.get('paperworkIssuesReason');
      
      if (value) {
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

  onSubmit(): void {
    if (this.driverForm.valid) {
      this.supabaseService.submitDriverForm(this.driverForm.value)
        .then(response => {
          if (response) {
            // Update the assignment status to completed
            this.supabaseService.updateFormAssignmentStatus(this.assignmentId, 'completed', response[0].id)
              .then(() => {
                alert('Form submitted successfully!');
                this.router.navigate(['/driver']);
              });
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

  navigateBack(): void {
    this.router.navigate(['/driver']);
  }
} 