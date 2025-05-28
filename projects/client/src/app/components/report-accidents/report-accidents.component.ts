import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

interface VehicleDetails {
  make: string;
  registration: string;
  colour: string;
  driverName: string;
  address: string;
  transportContact?: string;
  insuranceDetails: string;
  policyNumber: string;
  owner?: string;
  ownerAddress?: string;
}

// Updated interface to match your SQL structure
interface AccidentReport {
  id?: string;
  date_of_collision: string;
  location_of_collision: any; // Will be JSON object with lat/lng
  my_vehicle_make?: string;
  my_vehicle_registration?: string;
  my_vehicle_colour?: string;
  my_driver_name?: string;
  my_vehicle_address?: string;
  my_transport_contact?: string;
  my_insurance_details?: string;
  my_policy_number?: string;
  other_vehicle_make?: string;
  other_vehicle_registration?: string;
  other_vehicle_colour?: string;
  other_driver_name?: string;
  other_vehicle_address?: string;
  other_vehicle_owner?: string;
  other_vehicle_owner_address?: string;
  other_insurance_details?: string;
  other_policy_number?: string;
  other_damage_description?: string;
  my_injuries?: string;
  submit_success?: boolean;
  session_id?: string;
  created_at?: string;
}

interface ImagePreview {
  file: File;
  url: string;
}

@Component({
  selector: 'app-report-accidents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-accidents.component.html',
  styleUrls: ['./report-accidents.component.scss']
})
export class ReportAccidentsComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;
  
  // Basic incident information
  dateOfCollision: string = '';
  locationOfCollision: string = '';
  
  // Vehicle details
  myVehicle: VehicleDetails = {
    make: '',
    registration: '',
    colour: '',
    driverName: '',
    address: '24A Rampart Rd\nNewry\nN Ireland\nBT34 2QU',
    transportContact: 'Raymond Kinley\nTransport Manager Around Noon\n24A Rampart Rd\nNewry\nBT34 2QU\n+44 28 3026 2333 / +44 7990 072 354',
    insuranceDetails: 'AXA Insurance\nWolfe Tone House\nWolfe Tone Street\nDublin 1',
    policyNumber: '5/56/406827696'
  };
  
  otherVehicle: VehicleDetails = {
    make: '',
    registration: '',
    colour: '',
    driverName: '',
    address: '',
    insuranceDetails: '',
    policyNumber: '',
    owner: '',
    ownerAddress: ''
  };
  
  // Damage and injury descriptions
  myDamageDescription: string = '';
  otherDamageDescription: string = '';
  myInjuries: string = '';
  otherInjuries: string = '';
  
  // UI state
  showMyDetails: boolean = false;
  showOtherDetails: boolean = false;
  selectedImages: ImagePreview[] = [];
  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: string = '';
  showThankYou: boolean = false;
  isCapturingLocation: boolean = false;
  locationError: string = '';
  
  // Location options
  locationType: 'coordinates' | 'address' = 'coordinates';
  manualAddress: string = '';
  
  // Location data for JSON storage
  locationData: any = null;
  
  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    // Auto-populate driver name from logged-in user
    this.loadLoggedInDriverInfo();
    console.log('Accident report component initialized');
  }

  private loadLoggedInDriverInfo(): void {
    try {
      const loggedInDriver = localStorage.getItem('loggedInDriver');
      if (loggedInDriver) {
        const driverData = JSON.parse(loggedInDriver);
        if (driverData && driverData.name) {
          this.myVehicle.driverName = driverData.name;
          console.log('Auto-populated driver name:', driverData.name);
        }
      }
    } catch (error) {
      console.error('Error loading logged-in driver info:', error);
    }
  }

  toggleMyDetails(): void {
    this.showMyDetails = !this.showMyDetails;
  }

  toggleOtherDetails(): void {
    this.showOtherDetails = !this.showOtherDetails;
  }

  onLocationTypeChange(): void {
    // Clear previous location data when switching types
    this.locationOfCollision = '';
    this.locationData = null;
    this.manualAddress = '';
    this.locationError = '';
  }

  getLocationValue(): string {
    if (this.locationType === 'coordinates') {
      return this.locationOfCollision;
    } else {
      return this.manualAddress;
    }
  }

  captureLocation(): void {
    if (!navigator.geolocation) {
      this.locationError = 'Geolocation is not supported by this browser.';
      return;
    }

    this.isCapturingLocation = true;
    this.locationError = '';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        // Store location data as JSON object for database
        this.locationData = {
          latitude: latitude,
          longitude: longitude,
          accuracy: accuracy,
          timestamp: new Date().toISOString()
        };
        
        // Format the location string for display
        this.locationOfCollision = `Latitude: ${latitude.toFixed(6)}, Longitude: ${longitude.toFixed(6)} (Accuracy: ±${Math.round(accuracy)}m)`;
        
        this.isCapturingLocation = false;
        this.locationError = '';
      },
      (error) => {
        this.isCapturingLocation = false;
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            this.locationError = 'Location access denied. Please enable location permissions and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
            this.locationError = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            this.locationError = 'Location request timed out. Please try again.';
            break;
          default:
            this.locationError = 'An unknown error occurred while retrieving location.';
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  onImageSelect(event: any): void {
    const files = event.target.files;
    if (files) {
      // Clear previous error messages
      this.submitError = '';
      
      // Convert FileList to Array and limit total to 5 images
      const fileArray = Array.from(files) as File[];
      const remainingSlots = 5 - this.selectedImages.length;
      const filesToAdd = fileArray.slice(0, remainingSlots);
      
      let hasErrors = false;
      
      filesToAdd.forEach(file => {
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          this.submitError = `File ${file.name} is too large. Maximum size is 10MB.`;
          hasErrors = true;
          return;
        }
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          this.submitError = `File ${file.name} is not a valid image.`;
          hasErrors = true;
          return;
        }
        
        const imagePreview: ImagePreview = {
          file: file,
          url: URL.createObjectURL(file)
        };
        this.selectedImages.push(imagePreview);
      });
      
      // Show info if some files were skipped due to limit
      if (fileArray.length > filesToAdd.length && !hasErrors) {
        this.submitError = `Only ${filesToAdd.length} images were added. Maximum of 5 images allowed.`;
      }
      
      // Clear the input value to allow selecting the same file again
      event.target.value = '';
    }
  }

  openFileSelector(): void {
    this.fileInput.nativeElement.click();
  }

  openCamera(): void {
    this.cameraInput.nativeElement.click();
  }

  addMoreImages(): void {
    if (this.selectedImages.length < 5) {
      this.openFileSelector();
    }
  }

  removeImage(index: number): void {
    if (this.selectedImages[index]) {
      URL.revokeObjectURL(this.selectedImages[index].url);
      this.selectedImages.splice(index, 1);
    }
  }

  async submitAccidentReport(): Promise<void> {
    const locationValue = this.getLocationValue();
    if (!this.dateOfCollision || !locationValue) {
      this.submitError = 'Please provide date and location of collision.';
      return;
    }

    this.isSubmitting = true;
    this.submitError = '';
    this.submitSuccess = false;

    try {
      // Generate a session ID for tracking
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare location data based on type
      let locationForStorage: any;
      if (this.locationType === 'coordinates' && this.locationData) {
        locationForStorage = this.locationData;
      } else if (this.locationType === 'address' && this.manualAddress) {
        locationForStorage = { 
          address: this.manualAddress,
          type: 'manual_address'
        };
      } else {
        locationForStorage = { address: locationValue };
      }
      
      // First, insert the accident report
      const accidentData: AccidentReport = {
        date_of_collision: this.dateOfCollision,
        location_of_collision: locationForStorage,
        my_vehicle_make: this.myVehicle.make,
        my_vehicle_registration: this.myVehicle.registration,
        my_vehicle_colour: this.myVehicle.colour,
        my_driver_name: this.myVehicle.driverName,
        my_vehicle_address: this.myVehicle.address,
        my_transport_contact: this.myVehicle.transportContact,
        my_insurance_details: this.myVehicle.insuranceDetails,
        my_policy_number: this.myVehicle.policyNumber,
        other_vehicle_make: this.otherVehicle.make,
        other_vehicle_registration: this.otherVehicle.registration,
        other_vehicle_colour: this.otherVehicle.colour,
        other_driver_name: this.otherVehicle.driverName,
        other_vehicle_address: this.otherVehicle.address,
        other_vehicle_owner: this.otherVehicle.owner,
        other_vehicle_owner_address: this.otherVehicle.ownerAddress,
        other_insurance_details: this.otherVehicle.insuranceDetails,
        other_policy_number: this.otherVehicle.policyNumber,
        other_damage_description: this.otherDamageDescription,
        my_injuries: this.myInjuries,
        submit_success: true,
        session_id: sessionId
      };

      const { data: reportData, error: insertError } = await this.supabaseService.getSupabase()
        .from('accident_reports')
        .insert([accidentData])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // Upload images if any and link them to the report
      if (this.selectedImages.length > 0 && reportData) {
        for (let i = 0; i < this.selectedImages.length; i++) {
          const imagePreview = this.selectedImages[i];
          const fileName = `accident_${reportData.id}_${Date.now()}_${i}.${imagePreview.file.name.split('.').pop()}`;
          
          const { data: uploadData, error: uploadError } = await this.supabaseService.getSupabase()
            .storage
            .from('vehicle-crash')
            .upload(fileName, imagePreview.file);

          if (uploadError) {
            console.error('Error uploading image:', uploadError);
            continue; // Continue with other images even if one fails
          }

          if (uploadData) {
            // Get public URL
            const { data: urlData } = this.supabaseService.getSupabase()
              .storage
              .from('vehicle-crash')
              .getPublicUrl(uploadData.path);

            // Insert image record
            const imageData = {
              accident_report_id: reportData.id,
              storage_bucket_path: uploadData.path,
              storage_bucket_url: urlData.publicUrl,
              original_filename: imagePreview.file.name,
              file_size_bytes: imagePreview.file.size,
              mime_type: imagePreview.file.type,
              image_order: i + 1,
              upload_status: 'uploaded'
            };

            await this.supabaseService.getSupabase()
              .from('accident_report_images')
              .insert([imageData]);
          }
        }
      }

      // Clean up object URLs
      this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
      
      // Reset form
      this.resetForm();
      
      // Show thank you message
      this.showThankYou = true;

    } catch (error) {
      console.error('Error submitting accident report:', error);
      this.submitError = 'Failed to submit accident report. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  private resetForm(): void {
    this.dateOfCollision = '';
    this.locationOfCollision = '';
    this.locationData = null;
    this.locationType = 'coordinates';
    this.manualAddress = '';
    this.locationError = '';
    
    // Auto-populate driver name again after reset
    this.loadLoggedInDriverInfo();
    
    this.myVehicle = {
      make: '',
      registration: '',
      colour: '',
      driverName: '',
      address: '24A Rampart Rd\nNewry\nN Ireland\nBT34 2QU',
      transportContact: 'Raymond Kinley\nTransport Manager Around Noon\n24A Rampart Rd\nNewry\nBT34 2QU\n+44 28 3026 2333 / +44 7990 072 354',
      insuranceDetails: 'AXA Insurance\nWolfe Tone House\nWolfe Tone Street\nDublin 1',
      policyNumber: '5/56/406827696'
    };
    this.otherVehicle = {
      make: '',
      registration: '',
      colour: '',
      driverName: '',
      address: '',
      insuranceDetails: '',
      policyNumber: '',
      owner: '',
      ownerAddress: ''
    };
    this.myDamageDescription = '';
    this.otherDamageDescription = '';
    this.myInjuries = '';
    this.otherInjuries = '';
    this.selectedImages = [];
    this.showMyDetails = false;
    this.showOtherDetails = false;
  }

  goBackToHome(): void {
    // Clean up object URLs before navigating away
    this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy(): void {
    // Clean up object URLs when component is destroyed
    this.selectedImages.forEach(img => URL.revokeObjectURL(img.url));
  }
} 