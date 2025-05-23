import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-store-library',
  templateUrl: './store-library.component.html',
  styleUrl: './store-library.component.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink]
})
export class StoreLibraryComponent implements OnInit {
  searchTerm: string = '';
  storeDetails: any = null;
  loading: boolean = false;
  error: string = '';
  savingLocation: boolean = false;
  
  // New properties for autocomplete
  filteredOptions: any[] = [];
  storesList: any[] = [];

  // Properties for store images and additional info
  storeImages: any[] = [];
  storefrontImage: any = null;
  shopImage: any = null;
  additionalInfo: string = '';
  imagesLoading: boolean = false;
  additionalInfoLoading: boolean = false;
  selectedImage: any = null;

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    // Fetch all stores for autocomplete
    this.fetchAllStores();
  }
  
  fetchAllStores(): void {
    this.supabaseService.getAllStores()
      .then(stores => {
        if (stores && stores.length > 0) {
          this.storesList = stores.map(store => ({
            id: store.id,
            code: store.store_code || store.dispatch_code,
            name: store.dispatch_store_name || store.store_name,
            data: store
          }));
        }
      })
      .catch(err => {
        console.error('Error fetching stores:', err);
      });
  }
  
  onSearchInput(): void {
    if (this.searchTerm.length > 0) {
      // Filter based on search term (case insensitive)
      const term = this.searchTerm.toLowerCase();
      this.filteredOptions = this.storesList
        .filter(store => 
          (store.code && store.code.toLowerCase().includes(term)) || 
          (store.name && store.name.toLowerCase().includes(term))
        )
        .slice(0, 5); // Limit to 5 results
    } else {
      this.filteredOptions = [];
    }
  }
  
  // Helper method to normalize delivery day values
  private normalizeDeliveryDays(storeData: any): void {
    // First check if we have store data
    if (!storeData) return;
    
    // Define the days to check
    const deliveryDays = [
      'deliver_monday', 
      'deliver_tuesday', 
      'deliver_wednesday', 
      'deliver_thursday', 
      'deliver_friday', 
      'deliver_saturday'
    ];
    
    // Process each day
    deliveryDays.forEach(day => {
      // If the value is undefined or null, set it to 'No'
      if (storeData[day] === undefined || storeData[day] === null) {
        storeData[day] = 'No';
      } 
      // Convert boolean true to 'Yes'
      else if (storeData[day] === true) {
        storeData[day] = 'Yes';
      }
      // Convert boolean false to 'No'
      else if (storeData[day] === false) {
        storeData[day] = 'No';
      }
      // Convert string 'true' to 'Yes'
      else if (typeof storeData[day] === 'string' && storeData[day].toLowerCase() === 'true') {
        storeData[day] = 'Yes';
      }
      // Convert string 'false' to 'No'
      else if (typeof storeData[day] === 'string' && storeData[day].toLowerCase() === 'false') {
        storeData[day] = 'No';
      }
      // If it's any other value, ensure it's either 'Yes' or 'No'
      else if (storeData[day] !== 'Yes') {
        storeData[day] = 'No';
      }
    });
    
    console.log('Normalized delivery days:', {
      monday: storeData.deliver_monday,
      tuesday: storeData.deliver_tuesday,
      wednesday: storeData.deliver_wednesday,
      thursday: storeData.deliver_thursday,
      friday: storeData.deliver_friday,
      saturday: storeData.deliver_saturday
    });
  }
  
  selectSearchResult(result: any): void {
    this.searchTerm = result.code || result.name;
    this.filteredOptions = [];
    this.storeDetails = result.data;
    
    // Normalize delivery day values
    this.normalizeDeliveryDays(this.storeDetails);
    
    // Log delivery day fields to verify they're being received
    console.log('Selected store delivery days:', {
      monday: this.storeDetails.deliver_monday,
      tuesday: this.storeDetails.deliver_tuesday,
      wednesday: this.storeDetails.deliver_wednesday,
      thursday: this.storeDetails.deliver_thursday,
      friday: this.storeDetails.deliver_friday,
      saturday: this.storeDetails.deliver_saturday
    });
    
    // Load store images and additional info when a store is selected
    this.loadStoreImages();
    this.loadAdditionalInfo();
  }

  searchStore(): void {
    if (!this.searchTerm) {
      this.error = 'Please enter a search term';
      return;
    }
    
    this.loading = true;
    this.error = '';
    this.storeDetails = null;
    this.storeImages = [];
    this.additionalInfo = '';
    
    // If we already have matching results in filteredOptions, use the first one
    if (this.filteredOptions.length > 0) {
      this.storeDetails = this.filteredOptions[0].data;
      
      // Normalize delivery day values
      this.normalizeDeliveryDays(this.storeDetails);
      
      this.filteredOptions = [];
      this.loading = false;
      
      // Log delivery day fields to verify they're being received
      console.log('Selected store delivery days:', {
        monday: this.storeDetails.deliver_monday,
        tuesday: this.storeDetails.deliver_tuesday,
        wednesday: this.storeDetails.deliver_wednesday,
        thursday: this.storeDetails.deliver_thursday,
        friday: this.storeDetails.deliver_friday,
        saturday: this.storeDetails.deliver_saturday
      });
      
      // Load store images and additional info
      this.loadStoreImages();
      this.loadAdditionalInfo();
      return;
    }

    // Search across all fields (store_code, dispatch_code, dispatch_store_name)
    this.supabaseService.searchStoreAcrossFields(this.searchTerm)
      .then(result => {
        this.loading = false;
        if (result && result.length > 0) {
          this.storeDetails = result[0];
          
          // Normalize delivery day values
          this.normalizeDeliveryDays(this.storeDetails);
          
          // Load store images and additional info
          this.loadStoreImages();
          this.loadAdditionalInfo();
        } else {
          this.error = 'No store found with the provided information';
        }
      })
      .catch(err => {
        this.loading = false;
        this.error = 'Error searching for store: ' + (err.message || 'Unknown error');
        console.error('Store search error:', err);
      });
  }
  
  // Process images to ensure they have proper URL format
  private normalizeImageData(images: any[]): any[] {
    if (!images || !Array.isArray(images)) return [];
    
    return images.map(img => {
      // Make a copy to avoid modifying the original
      const normalizedImg = { ...img };
      
      // If no URL but has file_path, copy to url property for consistent access
      if (!normalizedImg.url && normalizedImg.file_path) {
        normalizedImg.url = normalizedImg.file_path;
      }
      
      // If no file_path but has url, copy to file_path property 
      if (!normalizedImg.file_path && normalizedImg.url) {
        normalizedImg.file_path = normalizedImg.url;
      }
      
      return normalizedImg;
    });
  }
  
  // Load store images from Supabase
  loadStoreImages(): void {
    if (!this.storeDetails?.id) {
      console.log('No store id available for loading images');
      return;
    }
    
    console.log('Loading images for store_id:', this.storeDetails.id);
    
    this.imagesLoading = true;
    this.storeImages = [];
    this.storefrontImage = null;
    this.shopImage = null;
    
    try {
      // Use the new service method to get properly formatted image URLs
      this.supabaseService.getStoreImages(this.storeDetails.id)
        .then(images => {
          this.imagesLoading = false;
          
          // Log the retrieved image data to debug instructions field
          console.log('Store images data:', images);
          
          // Check if the image data has the expected url property
          if (images && images.length > 0) {
            console.log('First image URL structure:', {
              url: images[0].url,
              file_path: images[0].file_path,
              hasURL: !!images[0].url,
              hasFilePath: !!images[0].file_path
            });
          }
          
          // Normalize the image data to ensure proper URL properties
          this.storeImages = this.normalizeImageData(images || []);
          console.log(`Found ${this.storeImages.length} images for store`);
          
          // Find and set the storefront image if available
          this.storefrontImage = this.storeImages.find(img => img.is_storefront === true);
          console.log('Storefront image found:', this.storefrontImage);
          
          // Try different formats of is_storefront value
          if (!this.storefrontImage) {
            console.log('Trying alternative storefront detection');
            this.storefrontImage = this.storeImages.find(img => 
              img.is_storefront === 'true' || 
              img.is_storefront === 'yes' || 
              img.is_storefront === 1 ||
              img.is_storefront === '1'
            );
            console.log('Alternative storefront image found:', this.storefrontImage);
          }
          
          // Find and set the shop image if available (prioritize this over regular storefront)
          this.shopImage = this.storeImages.find(img => img.is_shop_image === true);
          
          // If we have a shop image, use it as the primary display image
          if (this.shopImage) {
            console.log('Using shop image as primary display image');
            this.storefrontImage = this.shopImage;
          }
          
          // If still no storefront image but we have some images, use the first one
          if (!this.storefrontImage && this.storeImages.length > 0) {
            console.log('No storefront flag found, using first image as storefront');
            this.storefrontImage = this.storeImages[0];
          }

          // Debug storefront image after all selection logic
          if (this.storefrontImage) {
            console.log('Final storefront image URL check:', {
              imageObject: this.storefrontImage,
              url: this.storefrontImage.url,
              file_path: this.storefrontImage.file_path,
              hasURL: !!this.storefrontImage.url,
              hasFilePath: !!this.storefrontImage.file_path
            });
          } else {
            console.log('No storefront image was found after all selection logic');
          }
          
          // Check if any images have instructions
          if (this.storeImages.length > 0) {
            const imagesWithInstructions = this.storeImages.filter(img => img.instructions);
            console.log('Images with instructions:', imagesWithInstructions);
          }
          
          // Log regular images after filtering
          const regularImages = this.getRegularImages();
          console.log('Regular images after filtering:', regularImages);
          console.log('Regular images count:', regularImages.length);
        })
        .catch(err => {
          this.imagesLoading = false;
          console.error('Error loading store images:', err);
        });
    } catch (err: unknown) {
      this.imagesLoading = false;
      console.error('Exception while loading store images:', err);
    }
  }
  
  // Load additional store info from Supabase
  loadAdditionalInfo(): void {
    if (!this.storeDetails?.id) return;
    
    this.additionalInfoLoading = true;
    this.additionalInfo = '';
    
    this.supabaseService.getSupabase()
      .from('store_additional_info')
      .select('content')
      .eq('store_id', this.storeDetails.id)
      .maybeSingle()
      .then(({ data, error }) => {
        this.additionalInfoLoading = false;
        
        if (error) {
          console.error('Error loading additional info:', error);
          return;
        }
        
        this.additionalInfo = data?.content || '';
      });
  }
  
  // Select an image to view details
  selectImage(image: any): void {
    this.selectedImage = this.selectedImage?.id === image.id ? null : image;
    console.log('Selected image:', this.selectedImage);
  }
  
  // Filter out storefront/shop images to only show regular images
  getRegularImages(): any[] {
    return this.storeImages.filter(img => {
      // Check for all possible variations of storefront flag
      const isStorefront = img.is_storefront === true || 
                          img.is_storefront === 'true' || 
                          img.is_storefront === 'yes' || 
                          img.is_storefront === 1 ||
                          img.is_storefront === '1';
      
      // Check for all possible variations of shop image flag
      const isShopImage = img.is_shop_image === true || 
                          img.is_shop_image === 'true' || 
                          img.is_shop_image === 'yes' || 
                          img.is_shop_image === 1 ||
                          img.is_shop_image === '1';
      
      // Return true for images that are NOT storefront or shop images
      return !isStorefront && !isShopImage;
    });
  }
  
  saveCurrentLocation(): void {
    if (!this.storeDetails || !this.storeDetails.id) {
      this.error = 'Store information is required to save location';
      return;
    }

    this.savingLocation = true;
    this.error = '';

    if (!navigator.geolocation) {
      this.error = 'Geolocation is not supported by your browser';
      this.savingLocation = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        
        this.supabaseService.updateStoreLocation(
          this.storeDetails.id, 
          latitude, 
          longitude
        )
        .then(() => {
          // Update both uppercase and lowercase properties in the local object
          this.storeDetails.Latitude = latitude;
          this.storeDetails.Longitude = longitude;
          this.storeDetails.latitude = latitude;
          this.storeDetails.longitude = longitude;
          
          // Show success message
          this.error = '';
          alert(`Location saved successfully! Latitude: ${latitude}, Longitude: ${longitude}`);
          
          this.savingLocation = false;
        })
        .catch(err => {
          this.error = 'Error saving location: ' + (err.message || 'Unknown error');
          this.savingLocation = false;
          console.error('Save location error:', err);
        });
      },
      (error) => {
        this.error = 'Error getting current location: ' + error.message;
        this.savingLocation = false;
        console.error('Geolocation error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }
} 