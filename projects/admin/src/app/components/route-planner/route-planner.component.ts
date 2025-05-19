import { Component, OnInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import { MapsApiService } from '../../services/maps-api.service';
import { TspLocation, solveTsp, TspOptions } from '../../utils/tsp-solver';

interface StoreLocation {
  storeName: string;
  quantity: number;
  route: string;
  eircode: string;
  address: string;
  openingTime: string;
  lat?: number;
  lng?: number;
  eta?: string; // Estimated time of arrival
  travelTimeMinutes?: number; // Travel time from previous location in minutes
  routeOrder?: number; // Position in the optimized route
  priority?: boolean; // Whether this store is a priority
  hasKeys?: boolean; // Whether this store has keys
  openingTimeObj?: Date; // Parsed opening time as Date object
}

// Interface for distance matrix results
interface DistanceMatrixResult {
  origins: google.maps.LatLngLiteral[];
  destinations: google.maps.LatLngLiteral[];
  distances: number[][];
  durations: number[][];
}

// Interface for route settings
interface RouteSettings {
  startTime: string;
  visible: boolean;
}

declare global {
  interface Window {
    googleMapsLoaded?: boolean;
  }
}

@Component({
  selector: 'app-route-planner',
  templateUrl: './route-planner.component.html',
  styleUrls: ['./route-planner.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, GoogleMapsModule, RouterModule]
})
export class RoutePlannerComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;

  // Google Maps properties
  apiLoaded = false;
  center: google.maps.LatLngLiteral = { lat: 53.3498, lng: -6.2603 }; // Dublin center
  zoom = 10;
  mapMarkerOptions = {
    draggable: false,
    animation: null // Remove drop animation
  };
  markers: { position: google.maps.LatLngLiteral, info: string }[] = [];
  pathCoordinates: google.maps.LatLngLiteral[] = [];
  polylineOptions = {
    strokeColor: '#2c5282', 
    strokeOpacity: 1.0,
    strokeWeight: 6,
    geodesic: true,
    icons: [{
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 3.5,
        strokeColor: '#FFFFFF',
        fillColor: '#FFFFFF',
        fillOpacity: 1
      },
      offset: '0',
      repeat: '120px'
    }]
  };

  // Multiple route polylines
  routePolylines: Map<string, { 
    path: google.maps.LatLngLiteral[], 
    options: any 
  }> = new Map();
  showMultipleRoutePolylines = false;

  // Starting point properties
  startingPointAddress = '';
  startingPointMarker: {
    position: google.maps.LatLngLiteral;
    options: google.maps.MarkerOptions;
  } | null = null;
  applyStartingPointToAllRoutes = true; // Control whether starting point is used for all routes

  // Time properties
  startTime = '09:00'; // Default start time
  averageSpeedKmh = 40; // Average speed in km/h
  averageStopTimeMinutes = 15; // Average time spent at each stop in minutes

  // Optimization properties
  optimizedRoute: number[] = [];
  isOptimizing = false;
  considerOpeningTimes = false; // Whether to consider opening times in optimization

  // UI state properties
  routeOptionsExpanded = true;

  // Data properties
  storeLocations: StoreLocation[] = [];
  isLoading = false;
  errorMessage = '';

  // New property for just displaying starting point and store locations without route markers
  displayMarkersOnly = true;

  // Directions service
  directionsService: google.maps.DirectionsService | null = null;

  // Constants for Google Maps API limits
  readonly MAX_WAYPOINTS_PER_REQUEST = 23;
  readonly MAX_ELEMENTS_PER_DISTANCE_MATRIX = 100; // 10x10 grid
  
  // Distance Matrix API properties
  distanceMatrix: number[][] = [];
  distanceMatrixService: google.maps.DistanceMatrixService | null = null;

  // Google Maps API Key - should be managed securely in a proper environment
  private googleMapsApiKey: string = '';

  // Properties for manual location entry
  showMissingLocations = true;
  showCoordinateInputs = false;
  manualAddressInputs: string[] = [];
  manualLatInputs: number[] = [];
  manualLngInputs: number[] = [];

  // Properties for marker highlighting
  highlightedMarkerIndex: number | null = null;
  normalMarkerOptions: google.maps.MarkerOptions = { 
    draggable: false,
    animation: null // Remove drop animation
  };
  highlightedMarkerOptions: google.maps.MarkerOptions = { 
    draggable: false,
    animation: null,
    zIndex: 1000,
    icon: {
      path: 'M0,0 C-2,-20 -10,-22 -10,-30 A10,10 0 1,1 10,-30 C10,-22 2,-20 0,0 Z',
      fillColor: '#f6ad55',
      fillOpacity: 1,
      strokeWeight: 1, // Adjusted for pin shape
      strokeColor: '#ffffff',
      scale: 1.5 // Adjusted for SVG path
    }
  };

  // Properties for address editing
  editingStoreIndex: number | null = null;
  editedAddress: string = '';
  editedEircode: string = '';

  // Properties for route filtering
  availableRoutes: string[] = [];
  selectedRoute: string = 'All Routes';
  routeColorMap: Map<string, string> = new Map([
    ['Dublin 1', '#2c5282'],  // Blue
    ['Dublin 2', '#c05621'],  // Orange
    ['Dublin 3', '#38a169'],  // Green
    ['Dublin 4', '#805ad5'],  // Purple
    ['Dublin 5', '#d53f8c'],  // Pink
    ['Dublin 6', '#dd6b20'],  // Dark Orange
    ['Dublin 7', '#2b6cb0'],  // Darker Blue
    ['Dublin 8', '#2f855a'],  // Darker Green
    ['Dublin 9', '#6b46c1'],  // Darker Purple
    ['Dublin 10', '#b83280'], // Darker Pink
  ]);
  
  // Properties for route visibility checkboxes
  selectedRoutes: Set<string> = new Set();
  
  // Route-specific settings
  routeSettings: Map<string, RouteSettings> = new Map();
  
  // Cache for route marker icons to improve performance
  private routeMarkerIcons: Map<string, google.maps.Symbol> = new Map();

  constructor(private ngZone: NgZone, private mapsApiService: MapsApiService) {}

  ngOnInit(): void {
    this.checkGoogleMapsLoaded();
  }

  checkGoogleMapsLoaded(): void {
    // Check if Google Maps is already loaded
    if (window.googleMapsLoaded) {
      this.apiLoaded = true;
      this.initializeDirectionsService();
    } else {
      // If not loaded yet, listen for the custom event
      window.addEventListener('google-maps-loaded', () => {
        this.ngZone.run(() => {
          this.apiLoaded = true;
          this.initializeDirectionsService();
        });
      });
      
      // Fallback timeout in case the event doesn't fire
      setTimeout(() => {
        if (!this.apiLoaded) {
          console.warn('Google Maps did not load via event, checking global object');
          if (typeof google !== 'undefined' && google.maps) {
            this.ngZone.run(() => {
              this.apiLoaded = true;
              this.initializeDirectionsService();
            });
          }
        }
      }, 5000);
    }
  }

  initializeDirectionsService(): void {
    if (google && google.maps) {
      this.directionsService = new google.maps.DirectionsService();
      this.distanceMatrixService = new google.maps.DistanceMatrixService();
    }
  }

  onFileUpload(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      this.readAndProcessFile(file);
    }
  }

  readAndProcessFile(file: File): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.markers = [];
    this.storeLocations = [];
    this.pathCoordinates = [];
    this.optimizedRoute = [];
    this.startingPointMarker = null;

    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      try {
        const arrayBuffer = fileReader.result as ArrayBuffer;
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A' });
        
        // Process the data
        this.storeLocations = this.processExcelData(jsonData);
        
        // Geocode addresses
        this.geocodeAddresses();
      } catch (error) {
        console.error('Error processing file:', error);
        this.errorMessage = 'Error processing file. Please check the format and try again.';
        this.isLoading = false;
      }
    };
    
    fileReader.onerror = (error) => {
      console.error('File reading error:', error);
      this.errorMessage = 'Error reading file. Please try again.';
      this.isLoading = false;
    };
    
    fileReader.readAsArrayBuffer(file);
  }

  processExcelData(jsonData: any[]): StoreLocation[] {
    // Skip header row if present
    const dataStartIndex = jsonData[0]?.A === 'Store Name' || 
                           (typeof jsonData[0]?.A === 'string' && 
                            jsonData[0]?.A.toLowerCase().includes('store')) ? 1 : 0;
    
    const processedData = jsonData.slice(dataStartIndex).map(row => {
      // Check if "keys" is in the opening time field
      const openingTime = row.F || '';
      const hasKeys = typeof openingTime === 'string' && 
                      openingTime.toLowerCase().includes('key');
      
      const storeLocation: StoreLocation = {
        storeName: row.A || '',
        quantity: Number(row.B) || 0,
        route: row.C || '',
        eircode: row.D || '',
        address: row.E || '',
        openingTime: openingTime,
        hasKeys: hasKeys,
        priority: hasKeys // Stores with keys are prioritized by default
      };
      
      // Parse opening time if it's not "keys"
      if (!hasKeys && openingTime) {
        try {
          // Try to parse time formats like "07:30", "7:30", "07.30", etc.
          const timeRegex = /(\d{1,2})[:\.]?(\d{2})/;
          const match = openingTime.match(timeRegex);
          
          if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            
            // Create a date object with today's date but with the opening time
            const openingTimeObj = new Date();
            openingTimeObj.setHours(hours, minutes, 0, 0);
            storeLocation.openingTimeObj = openingTimeObj;
          }
        } catch (e) {
          console.warn(`Could not parse opening time: ${openingTime}`);
        }
      }
      
      return storeLocation;
    }).filter(store => store.storeName && (store.address || store.eircode));
    
    // Extract unique routes and assign colors
    this.extractRoutes(processedData);
    
    return processedData;
  }

  // Extract unique routes and set up color mapping
  extractRoutes(stores: StoreLocation[]): void {
    this.availableRoutes = ['All Routes', ...new Set(stores.map(store => store.route))].filter(Boolean);
    
    // Create color mapping for routes
    this.routeColorMap.clear();
    this.routeMarkerIcons.clear(); // Clear icon cache
    this.selectedRoutes.clear();
    
    // Add all routes to the selected routes set by default
    this.availableRoutes.forEach(route => {
      if (route !== 'All Routes') {
        this.selectedRoutes.add(route);
        
        // Initialize route settings with default values if not exist
        if (!this.routeSettings.has(route)) {
          this.routeSettings.set(route, {
            startTime: this.startTime, // Default to global start time
            visible: true
          });
        }
      }
    });
    
    // Define default colors to use
    const routeColors = [
      '#2c5282', // blue (primary color)
      '#c05621', // orange 
      '#38a169', // green
      '#805ad5', // purple
      '#d53f8c', // pink
      '#dd6b20', // dark orange
      '#2b6cb0', // darker blue
      '#2f855a', // darker green
      '#6b46c1', // darker purple
      '#b83280', // darker pink
    ];
    
    this.availableRoutes.forEach((route, index) => {
      if (route !== 'All Routes') {
        // Use modulo to cycle through colors if we have more routes than colors
        const colorIndex = (index - 1) % routeColors.length;
        const routeColor = routeColors[colorIndex];
        this.routeColorMap.set(route, routeColor);
        
        // Pre-create marker icons for each route
        this.routeMarkerIcons.set(route, {
          path: 'M0,0 C-2,-20 -10,-22 -10,-30 A10,10 0 1,1 10,-30 C10,-22 2,-20 0,0 Z',
          fillColor: routeColor,
          fillOpacity: 1,
          strokeWeight: 1, // Adjusted for pin shape
          strokeColor: '#ffffff',
          scale: 1 // Adjusted for SVG path
        });
      }
    });
  }

  // Change selected route
  changeRoute(route: string): void {
    this.selectedRoute = route;
    this.updateMapForRoute();
  }

  // Update map to show only markers for the selected route
  updateMapForRoute(): void {
    // Update map center
    this.updateMap();
    
    // Redraw the route if it's optimized
    if (this.optimizedRoute.length > 0) {
      this.calculateRouteForSelectedRoute();
    }
  }

  // Calculate route only for the selected route (if a specific route is selected)
  calculateRouteForSelectedRoute(): void {
    if (this.selectedRoute === 'All Routes') {
      // If all routes selected, recalculate the full route
      this.optimizeRoute();
      return;
    }
    
    // When showing a specific route, we want to focus on that single route
    // Disable multiple route polylines
    this.showMultipleRoutePolylines = false;
    
    // Filter optimized route indices to only show the selected route
    const filteredIndices = this.optimizedRoute.filter(idx => {
      if (idx >= 0 && idx < this.storeLocations.length) {
        return this.storeLocations[idx].route === this.selectedRoute;
      }
      return false;
    });
    
    if (filteredIndices.length > 0) {
      // Create path coordinates for the filtered route
      this.pathCoordinates = [];
      
      // Add starting point if it exists
      if (this.startingPointMarker) {
        this.pathCoordinates.push(this.startingPointMarker.position);
      }
      
      // Add filtered points
      filteredIndices.forEach(idx => {
        if (idx >= 0 && idx < this.markers.length) {
          this.pathCoordinates.push(this.markers[idx].position);
        }
      });
      
      // Update polyline color to match the selected route
      this.polylineOptions = this.getPolylineOptionsForRoute(this.selectedRoute);
      
      // Recalculate the road-based route
      this.calculateChunkedRoadRoute();
    } else {
      // If no markers for this route, clear the path
      this.pathCoordinates = [];
    }
  }

  // Update to filter stores by selected route
  getSortedLocations(): StoreLocation[] {
    // Filter by selected route if not "All Routes"
    let filteredLocations = this.storeLocations;
    if (this.selectedRoute !== 'All Routes') {
      filteredLocations = this.storeLocations.filter(store => 
        store.route === this.selectedRoute
      );
    }
    
    if (this.optimizedRoute.length === 0) {
      // If no optimization, show original order
      return filteredLocations;
    }
    
    // Create a copy to sort
    return [...filteredLocations].sort((a, b) => {
      // Items with routeOrder property come first, sorted by order
      if (a.routeOrder !== undefined && b.routeOrder !== undefined) {
        return a.routeOrder - b.routeOrder;
      } else if (a.routeOrder !== undefined) {
        return -1; // a comes first
      } else if (b.routeOrder !== undefined) {
        return 1; // b comes first
      } else {
        return 0; // preserve original order for unoptimized items
      }
    });
  }

  // Get route-specific marker options - optimized for performance
  getMarkerOptions(index: number): google.maps.MarkerOptions {
    // If this is the highlighted marker, return highlighted options
    if (index === this.highlightedMarkerIndex) {
      return this.highlightedMarkerOptions;
    }
    
    // If index is valid for a store location
    if (index >= 0 && index < this.storeLocations.length) {
      const store = this.storeLocations[index];
      const route = store.route;
      
      // If we have a cached icon for this route, use it
      if (route && this.routeMarkerIcons.has(route)) {
        return {
          ...this.normalMarkerOptions,
          icon: this.routeMarkerIcons.get(route)
        };
      }
    }
    
    // Otherwise return normal options
    return this.normalMarkerOptions;
  }

  // Update visible markers based on selected route
  getVisibleMarkers(): { position: google.maps.LatLngLiteral, info: string }[] {
    if (this.selectedRoute === 'All Routes') {
      return this.markers;
    }
    
    // Filter markers that correspond to the selected route
    return this.markers.filter((_, idx) => {
      // First check if this is a marker for a store (could be starting point marker)
      if (idx < this.storeLocations.length) {
        return this.storeLocations[idx].route === this.selectedRoute;
      }
      return false;
    });
  }

  // Check if store should be shown based on selected route
  shouldShowStore(store: StoreLocation): boolean {
    return this.selectedRoute === 'All Routes' || store.route === this.selectedRoute;
  }

  geocodeAddresses(): void {
    if (!this.storeLocations.length) {
      this.isLoading = false;
      return;
    }

    // Geocoding with Google Maps API
    if (!google || !google.maps || !google.maps.Geocoder) {
      console.error('Google Maps API not loaded properly');
      this.errorMessage = 'Map service not available. Please try refreshing the page.';
      this.isLoading = false;
      return;
    }

    const geocoder = new google.maps.Geocoder();
    let completedRequests = 0;
    const totalRequests = this.storeLocations.length;
    const batchSize = 5; // Process in smaller batches to avoid overwhelming the browser
    let currentBatch = 0;

    const processBatch = () => {
      const startIdx = currentBatch * batchSize;
      const endIdx = Math.min(startIdx + batchSize, this.storeLocations.length);
      
      // Process each store in the batch
      for (let i = startIdx; i < endIdx; i++) {
        const store = this.storeLocations[i];
        const index = i;
        
        // Combine address and eircode for more accurate results
        const addressQuery = `${store.address || ''} ${store.eircode || ''}`.trim();
        
        if (!addressQuery) {
        completedRequests++;
        checkCompletion();
        continue;
      }
      
      try {
          geocoder.geocode({ address: addressQuery }, (results, status) => {
            this.ngZone.run(() => {
              completedRequests++;
              
              if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                const location = results[0].geometry.location;
                this.storeLocations[index].lat = location.lat();
                this.storeLocations[index].lng = location.lng();
                
                // Add marker (simplified info window content)
                this.markers.push({
                  position: { lat: location.lat(), lng: location.lng() },
                  info: `<div class="info-window-content">
                          <h3>${store.storeName}</h3>
                          <p><strong>Route:</strong> ${store.route}</p>
                          <p><strong>Address:</strong> ${store.eircode}</p>
                        </div>`
                });
              } else {
                console.warn(`Geocoding failed for ${addressQuery}: ${status}`);
              }
              
              checkCompletion();
            });
          });
        } catch (error) {
          console.error('Geocoding error:', error);
          this.ngZone.run(() => {
            completedRequests++;
            checkCompletion();
          });
        }
      }
      
      // Process next batch if any
      currentBatch++;
      if (currentBatch * batchSize < totalRequests) {
        setTimeout(processBatch, 200); // Add delay between batches
      }
    };
    
    const checkCompletion = () => {
      // When all requests are complete, update the map
            if (completedRequests === totalRequests) {
              this.isLoading = false;
              this.updateMap();
        // Add this line to initialize missing locations UI
        this.processGeocodingResults();
      }
    };
    
    // Start processing the first batch
    processBatch();
  }

  setStartingPoint(): void {
    if (!this.startingPointAddress || !this.apiLoaded) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: this.startingPointAddress }, (results, status) => {
        this.ngZone.run(() => {
          this.isLoading = false;
          
          if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
            const location = results[0].geometry.location;
            
            // Set starting point marker with special styling
            this.startingPointMarker = {
              position: { lat: location.lat(), lng: location.lng() },
              options: {
                draggable: false,
                icon: {
                  path: 'M0,0 C-2,-20 -10,-22 -10,-30 A10,10 0 1,1 10,-30 C10,-22 2,-20 0,0 Z',
                  fillColor: '#4CAF50', // Green
                  fillOpacity: 1,
                  strokeWeight: 1, // Adjusted for pin shape
                  strokeColor: '#ffffff',
                  scale: 1.5 // Adjusted for SVG path
                },
                label: {
                  text: 'S',
                  color: 'white',
                  fontWeight: 'bold'
                },
                zIndex: 1000 // Ensure it appears on top
              }
            };

            // Center map on starting point
            this.center = this.startingPointMarker.position;
            
            // Clear previous route if any
            this.optimizedRoute = [];
            this.pathCoordinates = [];
            
          } else {
            this.errorMessage = `Could not find location: ${this.startingPointAddress}`;
            console.warn(`Geocoding failed for starting point: ${status}`);
          }
        });
      });
    } catch (error) {
      this.isLoading = false;
      this.errorMessage = 'Error setting starting point. Please try again.';
      console.error('Error setting starting point:', error);
    }
  }

  updateMap(): void {
    if (this.startingPointMarker) {
      // Center on starting point if available
      this.center = this.startingPointMarker.position;
    } else if (this.markers.length > 0) {
      // Otherwise center on first marker
      this.center = this.markers[0].position;
    }
    
    // Adjust zoom level to fit all markers
    this.adjustMapZoom();
  }

  adjustMapZoom(): void {
    // Simple implementation - could be enhanced
    if (this.markers.length > 10) {
      this.zoom = 8;
    } else if (this.markers.length > 5) {
      this.zoom = 9;
    } else {
      this.zoom = 10;
    }
  }

  openInfoWindow(marker: MapMarker, info: string): void {
    if (this.infoWindow && this.infoWindow.infoWindow) {
      this.infoWindow.infoWindow.setContent(info);
      this.infoWindow.open(marker);
    }
  }

  resetForm(): void {
    this.fileInput.nativeElement.value = '';
    this.markers = [];
    this.storeLocations = [];
    this.errorMessage = '';
    this.pathCoordinates = [];
    this.optimizedRoute = [];
    this.startingPointMarker = null;
    this.startingPointAddress = '';
    this.startTime = '09:00';
    
    // Reset map to Dublin center
    this.center = { lat: 53.3498, lng: -6.2603 };
    this.zoom = 10;
  }

  optimizeRoute(): void {
    try {
      if (!this.apiLoaded) {
        this.errorMessage = 'Map service not available. Please try refreshing the page.';
        return;
      }
      
      if (this.markers.length < 1) {
        this.errorMessage = 'At least one location is needed to optimize a route.';
        return;
      }

      this.isLoading = true;
      this.isOptimizing = true;
      this.errorMessage = '';
      this.optimizedRoute = [];
      this.pathCoordinates = [];
      this.routePolylines.clear();
      this.showMultipleRoutePolylines = false;

      // Check if we have multiple routes and log routes for debugging
      const uniqueRoutes = this.availableRoutes.filter(route => route !== 'All Routes');
      console.log(`Optimizing route with ${uniqueRoutes.length} different routes:`, uniqueRoutes);
      
      // Use a web worker or setTimeout to prevent UI blocking
      setTimeout(() => {
        this.ngZone.run(() => {
          try {
            // Check if we should use the enhanced optimization with Distance Matrix
            if (this.markers.length > this.MAX_WAYPOINTS_PER_REQUEST) {
              console.log(`Using enhanced optimization for ${this.markers.length} locations`);
              this.optimizeWithDistanceMatrix();
            } else {
              // For smaller routes, use the original approach
              console.log(`Using standard optimization for ${this.markers.length} locations`);
              this.buildDistanceMatrix()
                .then(() => this.optimizeRouteWithDistanceMatrix())
                .then(() => {
                  // Calculate ETAs
                  this.calculateETAs();
                  
                  // Update marker info windows with ETAs
                  this.updateMarkerInfo();
                  
                  // Make sure multiple route polylines are created
                  this.createMultiRoutePolylines();
                  const routeCount = this.availableRoutes.filter(route => route !== 'All Routes').length;
                  this.showMultipleRoutePolylines = routeCount > 1 && this.routePolylines.size > 0;
                  
                  // Force recalculation of driving directions for all selected routes
                  this.recalculateSelectedRoutesDirections();
                  
                  this.isLoading = false;
                  this.isOptimizing = false;
                }).catch(error => {
                  console.error('Route optimization error:', error);
                  this.errorMessage = 'Error optimizing route. Please try again.';
                  this.isLoading = false;
                  this.isOptimizing = false;
                  
                  // Fallback to simple optimization if distance matrix fails
                  this.optimizeRouteWorker().then(() => {
                    this.calculateETAs();
                    this.updateMarkerInfo();
                    
                    // Last attempt to create route polylines
                    this.createMultiRoutePolylines();
                    const routeCount = this.availableRoutes.filter(route => route !== 'All Routes').length;
                    this.showMultipleRoutePolylines = routeCount > 1 && this.routePolylines.size > 0;
                    
                    // Force recalculation of driving directions
                    this.recalculateSelectedRoutesDirections();
                  }).catch((err: Error) => console.error('Fallback optimization error:', err));
                });
            }
          } catch (error) {
            console.error('Route optimization error:', error);
            this.errorMessage = 'Error optimizing route. Please try again.';
            this.isLoading = false;
            this.isOptimizing = false;
          }
        });
      }, 100);
    } catch (error) {
      console.error('Error starting route optimization:', error);
      this.errorMessage = 'Error optimizing route. Please try again.';
      this.isLoading = false;
      this.isOptimizing = false;
    }
  }

  /**
   * Enhanced optimization with Google's Distance Matrix API and proper TSP solver
   * Handles routes with more than 23 waypoints
   */
  private optimizeWithDistanceMatrix(): void {
    // Create locations array for our TSP solver
    const locations: TspLocation[] = [];
    
    // Add all marker locations with metadata
    this.markers.forEach((marker, idx) => {
      const storeLocation = idx < this.storeLocations.length ? this.storeLocations[idx] : null;
      
      locations.push({
        index: idx,
        lat: marker.position.lat,
        lng: marker.position.lng,
        priority: storeLocation?.priority || false,
        openingTime: storeLocation?.openingTimeObj
      });
    });
    
    // Create starting location object if we have a custom starting point
    let startingPoint: google.maps.LatLngLiteral | null = null;
    let startNodeIndex = -1;
    
        if (this.startingPointMarker) {
      startingPoint = this.startingPointMarker.position;
      startNodeIndex = 0;
      
      // Add starting point to beginning of locations array
      locations.unshift({
        index: 0,
        lat: startingPoint.lat,
        lng: startingPoint.lng
      });
      
      // Adjust indices for the rest of the locations
      for (let i = 1; i < locations.length; i++) {
        locations[i].index = i;
      }
    }
    
    // Get all points for distance matrix
    const allPoints = locations.map(loc => ({
      lat: loc.lat,
      lng: loc.lng
    }));
    
    // Parse starting time
    const [startHours, startMinutes] = this.startTime.split(':').map(Number);
    const startTimeDate = new Date();
    startTimeDate.setHours(startHours, startMinutes, 0, 0);
    
    // Create TSP solver options
    const tspOptions: TspOptions = {
      considerOpeningTimes: this.considerOpeningTimes,
      considerPriorities: true,
      startTime: startTimeDate,
      averageStopDurationMinutes: this.averageStopTimeMinutes
    };
    
    // Use our Maps API service to create the distance matrix
    if (this.googleMapsApiKey) {
      // Use HTTP API
      this.mapsApiService.buildFullDistanceMatrix(allPoints, this.googleMapsApiKey)
        .subscribe(
          distanceMatrix => {
            this.processOptimizedRoute(distanceMatrix, locations, startNodeIndex, allPoints, tspOptions);
          },
          error => {
            console.error('Error getting distance matrix:', error);
            this.errorMessage = 'Error getting distance data. Falling back to simple optimization.';
            
            // Fall back to our client-side implementation
            this.buildDistanceMatrix()
              .then(() => this.optimizeRouteWithDistanceMatrix())
              .then(() => {
                this.calculateETAs();
                this.updateMarkerInfo();
                this.isLoading = false;
                this.isOptimizing = false;
              })
              .catch(err => {
                console.error('Fallback optimization error:', err);
                this.errorMessage = 'Route optimization failed. Please try again.';
                this.isLoading = false;
                this.isOptimizing = false;
              });
          }
        );
        } else {
      // Fall back to our client-side implementation
      this.buildDistanceMatrix()
        .then(() => this.optimizeRouteWithDistanceMatrix())
        .then(() => {
          this.calculateETAs();
          this.updateMarkerInfo();
          this.isLoading = false;
          this.isOptimizing = false;
        })
        .catch(err => {
          console.error('Optimization error:', err);
          this.errorMessage = 'Route optimization failed. Please try again.';
          this.isLoading = false;
          this.isOptimizing = false;
        });
    }
  }
  
  /**
   * Process the optimized route from the TSP solver
   */
  private processOptimizedRoute(
    distanceMatrix: number[][],
    locations: TspLocation[],
    startNodeIndex: number,
    allPoints: google.maps.LatLngLiteral[],
    tspOptions: TspOptions
  ): void {
    try {
      // Solve the TSP problem
      const optimizedIndices = solveTsp(
        distanceMatrix,
        startNodeIndex,
        locations,
        tspOptions
      );
      
      // Convert optimized indices to the actual route
      // Need to account for the starting point if it exists
      const hasCustomStarting = this.startingPointMarker !== null;
      const offset = hasCustomStarting ? 1 : 0;
      
      this.optimizedRoute = optimizedIndices
        .filter(idx => idx >= offset) // Remove starting point if it exists
        .map(idx => idx - offset);    // Map back to marker indices
      
      // Update routeOrder property in storeLocations for sorting
      this.optimizedRoute.forEach((idx, order) => {
        if (idx >= 0 && idx < this.storeLocations.length) {
          this.storeLocations[idx].routeOrder = order + 1;
        }
      });
      
      // Get points for the optimized route in the correct order
      const orderedPoints: google.maps.LatLngLiteral[] = [];
      
      // Add starting point if it exists
      if (this.startingPointMarker) {
        orderedPoints.push(this.startingPointMarker.position);
      }
      
      // Add all points in the optimized route
      this.optimizedRoute.forEach(idx => {
        if (idx >= 0 && idx < this.markers.length) {
          orderedPoints.push(this.markers[idx].position);
        }
      });
      
      // Create multiple route polylines first
      this.createMultiRoutePolylines();
      
      // If we have more than one route, use multiple polylines
      const routeCount = this.availableRoutes.filter(route => route !== 'All Routes').length;
      this.showMultipleRoutePolylines = routeCount > 1 && this.routePolylines.size > 0;
      
      // Get the road-based route using the Directions API (chunked if needed)
      if (this.googleMapsApiKey && orderedPoints.length > 1) {
        // Use HTTP API
        this.mapsApiService.getChunkedDirections(orderedPoints, this.googleMapsApiKey)
          .subscribe(
            pathPoints => {
              // Set path coordinates
              this.pathCoordinates = pathPoints;
              
              // Create multiple route polylines
              this.createMultiRoutePolylines();
              
              // Enable multiple route display if we have more than one route
              const routeCount = this.availableRoutes.filter(route => route !== 'All Routes').length;
              this.showMultipleRoutePolylines = routeCount > 1 && this.routePolylines.size > 0;
              
              // If not showing multiple routes, ensure the single route line is visible
              if (!this.showMultipleRoutePolylines) {
                // Make sure we have a visible path
                if (this.pathCoordinates.length === 0) {
                  this.pathCoordinates = orderedPoints;
                }
              }
              
              // Calculate ETAs
              this.calculateETAs();
              
              // Update marker info windows with ETAs
              this.updateMarkerInfo();
              
              // Force real driving directions for the routes
              this.recalculateSelectedRoutesDirections();
              
              this.isLoading = false;
              this.isOptimizing = false;
            },
            error => {
              console.error('Error getting directions:', error);
              
              // Fallback to straight lines
              this.pathCoordinates = orderedPoints;
              
              // Try to create route polylines again
              this.createMultiRoutePolylines();
              
              // Enable multiple route display if we have more than one route
              const routeCount = this.availableRoutes.filter(route => route !== 'All Routes').length;
              this.showMultipleRoutePolylines = routeCount > 1 && this.routePolylines.size > 0;
              
              // Calculate ETAs
              this.calculateETAs();
              
              // Update marker info windows with ETAs
              this.updateMarkerInfo();
              
              // Force real driving directions for the routes
              this.recalculateSelectedRoutesDirections();
              
              this.isLoading = false;
              this.isOptimizing = false;
            }
          );
          } else {
        // Fallback to client-side implementation
        this.pathCoordinates = orderedPoints;
        this.calculateChunkedRoadRoute().then(() => {
          // Calculate ETAs
          this.calculateETAs();
          
          // Update marker info windows with ETAs
          this.updateMarkerInfo();
          
          // Force real driving directions for the routes
          this.recalculateSelectedRoutesDirections();
          
          this.isLoading = false;
          this.isOptimizing = false;
        }).catch(error => {
          console.error('Error calculating road route:', error);
          
          // Fallback to straight lines
          this.pathCoordinates = orderedPoints;
          
          // Make sure to create the route polylines
          this.createMultiRoutePolylines();
              
          // Enable multiple route display if we have more than one route
          const routeCount = this.availableRoutes.filter(route => route !== 'All Routes').length;
          this.showMultipleRoutePolylines = routeCount > 1 && this.routePolylines.size > 0;
          
          // Calculate ETAs
          this.calculateETAs();
          
          // Update marker info windows with ETAs
          this.updateMarkerInfo();
          
          // Force real driving directions for the routes
          this.recalculateSelectedRoutesDirections();
          
          this.isLoading = false;
          this.isOptimizing = false;
        });
      }
    } catch (error) {
      console.error('Error processing optimized route:', error);
      this.errorMessage = 'Error optimizing route. Please try again.';
      this.isLoading = false;
      this.isOptimizing = false;
    }
  }

  /**
   * Build a complete distance matrix using the Google Distance Matrix API
   * Handles chunking for large numbers of locations to stay within API limits
   */
  buildDistanceMatrix(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.distanceMatrixService) {
        reject(new Error('Distance Matrix service not available'));
        return;
      }

      // Create locations array including starting point if set
      const locations: google.maps.LatLngLiteral[] = [];
      
      // Add starting point if defined
      if (this.startingPointMarker) {
        locations.push(this.startingPointMarker.position);
      }
      
      // Add all marker locations
      this.markers.forEach(marker => locations.push(marker.position));
      
      if (locations.length <= 1) {
        reject(new Error('At least two locations are needed to create a distance matrix'));
        return;
      }
      
      // Initialize empty distance matrix
      this.distanceMatrix = Array(locations.length).fill(0)
        .map(() => Array(locations.length).fill(0));
      
      // Create chunks of origin/destination pairs to stay within API limits
      // Distance Matrix API has a limit of 100 elements per request (10x10 grid)
      const chunkSize = Math.floor(Math.sqrt(this.MAX_ELEMENTS_PER_DISTANCE_MATRIX));
      const locationChunks: google.maps.LatLngLiteral[][] = [];
      
      for (let i = 0; i < locations.length; i += chunkSize) {
        locationChunks.push(locations.slice(i, i + chunkSize));
      }
      
      // Create all origin-destination chunk pairs
      const matrixPromises: Promise<DistanceMatrixResult>[] = [];
      
      for (let i = 0; i < locationChunks.length; i++) {
        for (let j = 0; j < locationChunks.length; j++) {
          matrixPromises.push(
            this.getDistanceMatrix(locationChunks[i], locationChunks[j])
          );
        }
      }
      
      // Execute all requests and combine results
      Promise.all(matrixPromises)
        .then(results => {
          // Combine all chunks into the complete distance matrix
          results.forEach(result => {
            // For each origin-destination pair in this chunk
            for (let i = 0; i < result.origins.length; i++) {
              for (let j = 0; j < result.destinations.length; j++) {
                // Find the indices of this origin and destination in the original locations array
                const originIndex = this.findLocationIndex(locations, result.origins[i]);
                const destIndex = this.findLocationIndex(locations, result.destinations[j]);
                
                if (originIndex !== -1 && destIndex !== -1) {
                  // Store both duration and distance (prioritize duration for optimization)
                  this.distanceMatrix[originIndex][destIndex] = result.durations[i][j];
                }
              }
            }
          });
          
          resolve();
        })
        .catch(error => {
          console.error('Error building distance matrix:', error);
          reject(error);
        });
    });
  }
  
  /**
   * Find the index of a location in an array of locations
   */
  findLocationIndex(locations: google.maps.LatLngLiteral[], location: google.maps.LatLngLiteral): number {
    return locations.findIndex(loc => 
      Math.abs(loc.lat - location.lat) < 1e-6 && 
      Math.abs(loc.lng - location.lng) < 1e-6
    );
  }
  
  /**
   * Get a distance matrix for a chunk of origins and destinations
   */
  getDistanceMatrix(
    origins: google.maps.LatLngLiteral[],
    destinations: google.maps.LatLngLiteral[]
  ): Promise<DistanceMatrixResult> {
    return new Promise((resolve, reject) => {
      if (!this.distanceMatrixService) {
        reject(new Error('Distance Matrix service not available'));
        return;
      }
      
      this.distanceMatrixService.getDistanceMatrix({
        origins: origins.map(origin => new google.maps.LatLng(origin.lat, origin.lng)),
        destinations: destinations.map(dest => new google.maps.LatLng(dest.lat, dest.lng)),
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC
      }, (response, status) => {
        if (status === google.maps.DistanceMatrixStatus.OK && response) {
          // Process and transform response to our simplified format
          const result: DistanceMatrixResult = {
            origins: origins,
            destinations: destinations,
            distances: [],
            durations: []
          };
          
          // Extract distances and durations
          response.rows.forEach(row => {
            const distanceRow: number[] = [];
            const durationRow: number[] = [];
            
            row.elements.forEach(element => {
              if (element.status === google.maps.DistanceMatrixElementStatus.OK) {
                distanceRow.push(element.distance.value / 1000); // Convert to km
                durationRow.push(element.duration.value / 60); // Convert to minutes
              } else {
                // If not OK, use a large value to discourage using this path
                distanceRow.push(9999);
                durationRow.push(9999);
              }
            });
            
            result.distances.push(distanceRow);
            result.durations.push(durationRow);
          });
          
          resolve(result);
        } else {
          console.error('Distance Matrix request failed:', status);
          reject(new Error(`Distance Matrix request failed: ${status}`));
        }
      });
    });
  }
  
  /**
   * Optimize route using the precomputed distance matrix
   * Uses a simple greedy algorithm (Nearest Neighbor)
   * Priorities are handled by sorting and considering opening times if enabled
   */
  optimizeRouteWithDistanceMatrix(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create locations array (including starting point if set)
        const locations: google.maps.LatLngLiteral[] = [];
        
        // Add starting point if defined
        let startIdx = -1;
        if (this.startingPointMarker) {
          locations.push(this.startingPointMarker.position);
          startIdx = 0;
        }
        
        // Add all marker locations
        this.markers.forEach(marker => locations.push(marker.position));
        
        // If no explicit starting point, use the first marker
        if (startIdx === -1 && this.markers.length > 0) {
          startIdx = 0;
        }
        
        if (startIdx === -1 || locations.length <= 1) {
          reject(new Error('No valid starting position or not enough locations'));
          return;
        }
        
        // Setup visited and unvisited arrays
        const visited: number[] = [startIdx];
        let current = startIdx;
        
        // Create a list of unvisited points (exclude starting point)
        const unvisited: number[] = [];
        for (let i = 0; i < locations.length; i++) {
          if (i !== startIdx) {
            unvisited.push(i);
          }
        }
        
        // Consider priorities and opening times
        if (this.considerOpeningTimes) {
          // Sort unvisited based on opening times
          // The mapping depends on whether we have a starting point
          const offset = this.startingPointMarker ? 1 : 0;
          
          unvisited.sort((a, b) => {
            // Map indices to store locations (offset by 1 if we have a starting point)
            const storeIdxA = a - offset;
            const storeIdxB = b - offset;
            
            // Check if these indices map to valid stores
            const storeA = storeIdxA >= 0 && storeIdxA < this.storeLocations.length ? 
                           this.storeLocations[storeIdxA] : null;
            const storeB = storeIdxB >= 0 && storeIdxB < this.storeLocations.length ? 
                           this.storeLocations[storeIdxB] : null;
            
            // First sort by priority (higher priority comes first)
            if (storeA?.priority && !storeB?.priority) return -1;
            if (!storeA?.priority && storeB?.priority) return 1;
            
            // Then sort by opening time
            if (storeA?.openingTimeObj && storeB?.openingTimeObj) {
              return storeA.openingTimeObj.getTime() - storeB.openingTimeObj.getTime();
            } else if (storeA?.openingTimeObj) {
              return -1; // A comes first
            } else if (storeB?.openingTimeObj) {
              return 1; // B comes first
            }
            
            return 0;
          });
        }
        
        // Find nearest neighbor for each step using the distance matrix
        while (unvisited.length > 0) {
          let nearest = -1;
          let minDistance = Infinity;
            
          for (const point of unvisited) {
            // Get distance from current to this point
            const distance = this.distanceMatrix[current][point];
            
            // If considering opening times, adjust distance based on estimated arrival
            if (this.considerOpeningTimes) {
              // Only for actual stores (not the starting point)
              const offset = this.startingPointMarker ? 1 : 0;
              const storeIdx = point - offset;
              
              if (storeIdx >= 0 && storeIdx < this.storeLocations.length) {
                const store = this.storeLocations[storeIdx];
                
                if (store.openingTimeObj) {
                  // Calculate estimated arrival (similar to the ETAs calculation)
                  let currentTime = new Date();
                  
                  // Set starting time
                  const [startHours, startMinutes] = this.startTime.split(':').map(Number);
                  currentTime.setHours(startHours, startMinutes, 0, 0);
                  
                  // Add travel times for already visited locations
                  for (let i = 1; i < visited.length; i++) {
                    const prevIdx = visited[i-1];
                    const thisIdx = visited[i];
                    const travelTime = this.distanceMatrix[prevIdx][thisIdx];
                    currentTime = new Date(currentTime.getTime() + travelTime * 60000);
                    currentTime = new Date(currentTime.getTime() + this.averageStopTimeMinutes * 60000);
                  }
                  
                  // Add travel time to potential next location
                  const travelTime = this.distanceMatrix[current][point];
                  const estimatedArrival = new Date(currentTime.getTime() + travelTime * 60000);
                  
                  // Penalty for arriving before opening
                  if (estimatedArrival < store.openingTimeObj) {
                    const waitTimeMinutes = (store.openingTimeObj.getTime() - estimatedArrival.getTime()) / 60000;
                    const adjustedDistance = distance + waitTimeMinutes * 0.5;
                    
                    if (adjustedDistance < minDistance) {
                      minDistance = adjustedDistance;
                      nearest = point;
                    }
                    continue;
                  }
                }
              }
            }
              
            if (distance < minDistance) {
              minDistance = distance;
              nearest = point;
            }
          }
          
          if (nearest !== -1) {
            // Add to visited and remove from unvisited
            visited.push(nearest);
            const index = unvisited.indexOf(nearest);
            unvisited.splice(index, 1);
            current = nearest;
          }
        }
      
        // Convert visited indices to the actual route
        // Need to account for the starting point if it exists
        const offset = this.startingPointMarker ? 1 : 0;
      
        this.optimizedRoute = visited
          .filter(idx => idx >= offset) // Remove starting point if it exists
          .map(idx => idx - offset); // Map back to marker indices
        
        // Update routeOrder property in storeLocations for sorting
        this.optimizedRoute.forEach((idx, order) => {
          if (idx >= 0 && idx < this.storeLocations.length) {
            this.storeLocations[idx].routeOrder = order + 1;
          }
        });
        
        // Calculate path coordinates for the map
        this.pathCoordinates = [];
      
        // Add starting point if it exists
        if (this.startingPointMarker) {
          this.pathCoordinates.push(this.startingPointMarker.position);
        }
      
        // Add all points in the optimized route
        this.optimizedRoute.forEach(idx => {
          if (idx >= 0 && idx < this.markers.length) {
            this.pathCoordinates.push(this.markers[idx].position);
          }
        });
      
        // Calculate road-based route using Directions API (chunked if needed)
        this.calculateChunkedRoadRoute().then(() => {
          setTimeout(resolve, 100);
        }).catch(error => {
          console.error('Error calculating road route:', error);
          // Fallback to straight lines if directions fail
          setTimeout(resolve, 100);
        });
      } catch (error) {
        console.error('Error in optimizeRouteWithDistanceMatrix:', error);
        reject(error);
      }
    });
  }

  /**
   * Calculate a road-based route in chunks to handle routes with many waypoints
   */
  calculateChunkedRoadRoute(): Promise<void> {
    // Reset path coordinates
    this.pathCoordinates = [];
    
    // If we're in multi-route mode, reset the polylines
    if (this.showMultipleRoutePolylines) {
      // Get existing routes
      const existingRoutes = Array.from(this.routePolylines.keys());
      
      // For each route, create a new promise to calculate the road route
      const routePromises = existingRoutes.map(routeName => {
        const routePolyline = this.routePolylines.get(routeName);
        if (routePolyline && routePolyline.path.length > 1) {
          return this.calculateRoadRouteForPath(routePolyline.path, routeName);
        }
        return Promise.resolve();
      });
      
      // Wait for all routes to be calculated
      return Promise.all(routePromises).then(() => {
        // Consider it complete
        return Promise.resolve();
      });
    } else {
      // Traditional single-route mode
      return new Promise<void>((resolve, reject) => {
        if (!this.directionsService) {
          console.error('Directions service not initialized');
          reject(new Error('Map service not available'));
          return;
        }
        
        if (this.pathCoordinates.length < 2) {
          console.warn('Not enough points to calculate a route');
          resolve();
          return;
        }
        
        try {
          // If we have more than the maximum waypoints allowed, split into chunks
          const maxSize = this.MAX_WAYPOINTS_PER_REQUEST + 1; // +1 for the destination
          
          if (this.pathCoordinates.length > maxSize) {
            // Create chunks of waypoints respecting the API limit
            const chunks: google.maps.LatLngLiteral[][] = [];
            let currentChunk: google.maps.LatLngLiteral[] = [];
            
            this.pathCoordinates.forEach((point, idx) => {
              currentChunk.push(point);
              
              // When we hit the maximum or the last point, start a new chunk
              // overlapping with the last point of the previous chunk
              if (currentChunk.length === maxSize || idx === this.pathCoordinates.length - 1) {
                chunks.push([...currentChunk]);
                
                // Start new chunk with the last point of the previous chunk
                // unless we've just processed the last point
                if (idx < this.pathCoordinates.length - 1) {
                  currentChunk = [point];
                }
              }
            });
            
            console.log(`Split route into ${chunks.length} chunks`);
            
            // Process chunks sequentially
            this.processChunkedRoutes(chunks, 0)
              .then(resolve)
              .catch(reject);
          } else {
            // Single request for small routes
            this.calculateRoadRoute()
              .then(resolve)
              .catch(error => {
                console.error('Error calculating road route:', error);
                // Fallback to straight lines if directions fail
                setTimeout(resolve, 100);
              });
          }
        } catch (error) {
          console.error('Error calculating chunked route:', error);
          reject(error);
        }
      });
    }
  }
  
  /**
   * Calculate road route for a specific path (for multi-route mode)
   */
  calculateRoadRouteForPath(path: google.maps.LatLngLiteral[], routeName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (path.length < 2) {
        console.warn(`Path too short for route ${routeName}: ${path.length} points`);
        resolve();
        return;
      }
      
      console.log(`Calculating road route for ${routeName} with ${path.length} points`);
      
      // Ensure we're using a valid DirectionsService instance
      if (!this.directionsService) {
        this.directionsService = new google.maps.DirectionsService();
      }
      
      // Check if path exceeds maximum waypoints
      // Google's Directions API can only handle requests with a certain number of waypoints
      // If we exceed that, we need to chunk the requests
      if (path.length > this.MAX_WAYPOINTS_PER_REQUEST) {
        console.log(`Path exceeds max waypoints (${path.length}), chunking into smaller requests`);
        
        // Split the path into chunks
        const chunks: google.maps.LatLngLiteral[][] = [];
        for (let i = 0; i < path.length; i += this.MAX_WAYPOINTS_PER_REQUEST - 1) {
          // Make sure chunks overlap by 1 point to ensure continuity
          const start = i === 0 ? 0 : i - 1;
          const end = Math.min(i + this.MAX_WAYPOINTS_PER_REQUEST, path.length);
          chunks.push(path.slice(start, end));
        }
        
        console.log(`Split into ${chunks.length} chunks`);
        
        // Process chunks recursively
        let allPathPoints: google.maps.LatLngLiteral[] = [];
        
        const processChunk = (chunkIndex: number): Promise<void> => {
          return new Promise<void>((resolveChunk, rejectChunk) => {
            if (chunkIndex >= chunks.length) {
              console.log(`All ${chunks.length} chunks processed`);
              
              // If we're calculating for a specific route, update the route polyline
              if (routeName) {
                this.routePolylines.set(routeName, {
                  path: allPathPoints,
                  options: this.getPolylineOptionsForRoute(routeName)
                });
                console.log(`Updated polyline for route ${routeName} with ${allPathPoints.length} points`);
              } else {
                // Otherwise, update the main path coordinates
                this.pathCoordinates = allPathPoints;
              }
              
              resolveChunk();
              return;
            }
            
            const chunk = chunks[chunkIndex];
            console.log(`Processing chunk ${chunkIndex+1}/${chunks.length} with ${chunk.length} points`);
            
            if (chunk.length < 2) {
              // Skip invalid chunks
              processChunk(chunkIndex + 1).then(resolveChunk).catch(rejectChunk);
              return;
            }
            
            // Make directions request for this chunk
            const origin = chunk[0];
            const destination = chunk[chunk.length - 1];
            const waypoints = chunk.slice(1, chunk.length - 1).map(point => ({
              location: point,
              stopover: false
            }));
            
            const request = {
              origin,
              destination,
              waypoints,
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false
            };
            
            this.directionsService!.route(request, (response, status) => {
              if (status === google.maps.DirectionsStatus.OK) {
                const chunkPath = this.extractPathFromDirectionsResponse(response);
                
                if (chunkIndex === 0) {
                  // For first chunk, use all points
                  allPathPoints = allPathPoints.concat(chunkPath);
                } else {
                  // For subsequent chunks, skip the first point to avoid duplication
                  allPathPoints = allPathPoints.concat(chunkPath.slice(1));
                }
                
                // Process next chunk
                processChunk(chunkIndex + 1).then(resolveChunk).catch(rejectChunk);
              } else {
                console.warn(`Directions request for chunk ${chunkIndex} failed: ${status}`);
                
                // Fall back to using the raw points for this chunk
                if (chunkIndex === 0) {
                  allPathPoints = allPathPoints.concat(chunk);
                } else {
                  allPathPoints = allPathPoints.concat(chunk.slice(1));
                }
                
                // Continue with next chunk
                processChunk(chunkIndex + 1).then(resolveChunk).catch(rejectChunk);
              }
            });
          });
        };
        
        // Start processing chunks
        processChunk(0)
          .then(() => resolve())
          .catch(error => reject(error));
      } else {
        // For smaller paths, make a single directions request
        const origin = path[0];
        const destination = path[path.length - 1];
        const waypoints = path.slice(1, path.length - 1).map(point => ({
          location: point,
          stopover: false
        }));
        
        const request = {
          origin,
          destination,
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false
        };
        
        this.directionsService!.route(request, (response, status) => {
          if (status === google.maps.DirectionsStatus.OK) {
            const routePath = this.extractPathFromDirectionsResponse(response);
            
            // If we're calculating for a specific route, update the route polyline
            if (routeName) {
              this.routePolylines.set(routeName, {
                path: routePath,
                options: this.getPolylineOptionsForRoute(routeName)
              });
              console.log(`Created polyline for route ${routeName} with ${routePath.length} points`);
            } else {
              // Otherwise, update the main path coordinates
              this.pathCoordinates = routePath;
            }
            
            resolve();
          } else {
            console.warn(`Directions request failed: ${status}`);
            
            // Fall back to using the raw points
            // If we're calculating for a specific route, update the route polyline
            if (routeName) {
              this.routePolylines.set(routeName, {
                path,
                options: this.getPolylineOptionsForRoute(routeName)
              });
              console.log(`Created fallback polyline for route ${routeName} with ${path.length} points`);
            } else {
              // Otherwise, update the main path coordinates
              this.pathCoordinates = path;
            }
            
            resolve();
          }
        });
      }
    });
  }

  /**
   * Extract path points from a directions response
   */
  extractPathFromDirectionsResponse(response: google.maps.DirectionsResult | null): google.maps.LatLngLiteral[] {
    const points: google.maps.LatLngLiteral[] = [];
    
    // Handle null response case
    if (!response) {
      console.warn('Received null directions response');
      return points;
    }
    
    // Process all routes and legs to extract the path
    if (response.routes && response.routes.length > 0) {
      response.routes[0].legs.forEach(leg => {
        if (leg.steps) {
          leg.steps.forEach(step => {
            if (step.path) {
              step.path.forEach(path => {
                // Handle both LatLng objects (with lat() method) and LatLngLiteral objects
                const lat = typeof path.lat === 'function' ? path.lat() : path.lat;
                const lng = typeof path.lng === 'function' ? path.lng() : path.lng;
                
                points.push({
                  lat: Number(lat),
                  lng: Number(lng)
                });
              });
            }
          });
        }
      });
    }
    
    return points;
  }

  calculateETAs(): void {
    if (this.optimizedRoute.length === 0) {
      return;
    }
    
    // Group optimized route by route name
    const routeGroups: Map<string, number[]> = new Map();
    
    this.optimizedRoute.forEach(idx => {
      if (idx >= 0 && idx < this.storeLocations.length) {
        const route = this.storeLocations[idx].route;
        if (!routeGroups.has(route)) {
          routeGroups.set(route, []);
        }
        routeGroups.get(route)!.push(idx);
      }
    });
    
    // Process each route separately with its own starting time
    routeGroups.forEach((indices, routeName) => {
      if (indices.length === 0) return;
      
      // Get route-specific starting time
      const routeStartTime = this.routeSettings.get(routeName)?.startTime || this.startTime;
      
      // Parse the starting time
      const [startHours, startMinutes] = routeStartTime.split(':').map(Number);
      let currentTime = new Date();
      currentTime.setHours(startHours, startMinutes, 0, 0);
      
      let prevPosition: google.maps.LatLngLiteral;
      
      // If we have a custom starting point and it's applied to all routes
      if (this.startingPointMarker && this.applyStartingPointToAllRoutes) {
        prevPosition = this.startingPointMarker.position;
      } else if (indices.length > 0) {
        // Start from the first location in this route
        const firstIdx = indices[0];
        prevPosition = this.markers[firstIdx].position;
        
        // Add ETA for first location (same as route start time)
        this.storeLocations[firstIdx].eta = this.formatTime(currentTime);
        
        // Add stop time for first location
        currentTime = new Date(currentTime.getTime() + this.averageStopTimeMinutes * 60000);
      } else {
        return;
      }
      
      // Calculate ETA for each location in this route's optimized order
      for (let i = (this.startingPointMarker && this.applyStartingPointToAllRoutes) ? 0 : 1; i < indices.length; i++) {
        const idx = indices[i];
        const currentPosition = this.markers[idx].position;
        
        // Calculate distance in km
        const distance = this.calculateDistance(prevPosition, currentPosition);
        
        // Calculate travel time in minutes
        const travelTimeMinutes = (distance / this.averageSpeedKmh) * 60;
        this.storeLocations[idx].travelTimeMinutes = Math.round(travelTimeMinutes);
        
        // Add travel time to current time
        currentTime = new Date(currentTime.getTime() + travelTimeMinutes * 60000);
        
        // Set ETA
        this.storeLocations[idx].eta = this.formatTime(currentTime);
        
        // Add stop time for this location
        currentTime = new Date(currentTime.getTime() + this.averageStopTimeMinutes * 60000);
        
        // Update previous position for next calculation
        prevPosition = currentPosition;
      }
    });
  }

  updateMarkerInfo(): void {
    // Update marker info windows with new ETAs
    this.optimizedRoute.forEach(idx => {
      const store = this.storeLocations[idx];
      if (store.eta && idx < this.markers.length) {
        const markerIndex = this.markers.findIndex(marker => 
          Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
          Math.abs(marker.position.lng - store.lng!) < 1e-6
        );
        
        if (markerIndex >= 0) {
        const orderText = store.routeOrder ? `<p><strong>Stop #:</strong> ${store.routeOrder}</p>` : '';
          this.markers[markerIndex].info = `<div class="info-window-content">
          <h3>${store.storeName}</h3>
          ${orderText}
          <p><strong>Route:</strong> ${store.route}</p>
            <p><strong>Address:</strong> ${store.eircode}</p>
          <p><strong>ETA:</strong> ${store.eta}</p>
        </div>`;
        }
      }
    });
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  calculateDistance(pos1: google.maps.LatLngLiteral, pos2: google.maps.LatLngLiteral): number {
    try {
      // Haversine formula to calculate distance between two points
      const R = 6371; // Radius of the Earth in km
      const dLat = this.toRadians(pos2.lat - pos1.lat);
      const dLng = this.toRadians(pos2.lng - pos1.lng);
      
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.toRadians(pos1.lat)) * Math.cos(this.toRadians(pos2.lat)) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
      
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; // Distance in km
    } catch (error) {
      console.error('Error calculating distance:', error);
      return Infinity; // Return a large value to avoid this route
    }
  }

  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  toggleRouteOptions(): void {
    this.routeOptionsExpanded = !this.routeOptionsExpanded;
  }

  getFileName(): string {
    if (this.fileInput && this.fileInput.nativeElement && this.fileInput.nativeElement.files && this.fileInput.nativeElement.files.length > 0) {
      return this.fileInput.nativeElement.files[0].name;
    }
    return 'No file chosen';
  }

  logout(): void {
    // Redirect to login page (assuming it's at the root)
    window.location.href = '/';
  }

  // Process geocoding results and update the missing locations inputs arrays
  processGeocodingResults(): void {
    // Initialize input arrays with appropriate length
    this.manualAddressInputs = Array(this.getMissingLocations().length).fill('');
    this.manualLatInputs = Array(this.getMissingLocations().length).fill(null);
    this.manualLngInputs = Array(this.getMissingLocations().length).fill(null);
    
    // For existing locations, pre-fill the lat/lng values
    this.getMissingLocations().forEach((store, idx) => {
      if (store.lat && store.lng) {
        this.manualLatInputs[idx] = store.lat;
        this.manualLngInputs[idx] = store.lng;
      }
    });
  }
  
  // Get locations that are missing geocoding data (either missing lat/lng or missing from markers)
  getMissingLocations(): StoreLocation[] {
    return this.storeLocations.filter(store => {
      // Missing location is one without lat/lng or without a marker
      const hasCoordinates = store.lat !== undefined && store.lng !== undefined;
      if (!hasCoordinates) return true;
      
      // Check if it has a marker
      const hasMarker = this.markers.some(marker => 
        Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
        Math.abs(marker.position.lng - store.lng!) < 1e-6
      );
      
      return !hasMarker;
    });
  }
  
  // Set location manually using an address
  setManualLocation(store: StoreLocation, address: string): void {
    if (!address || !this.apiLoaded) return;
    
    this.isLoading = true;
    
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      this.ngZone.run(() => {
        this.isLoading = false;
        
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const location = results[0].geometry.location;
          
          // Update store location data
          store.lat = location.lat();
          store.lng = location.lng();
          
          // Add marker
          this.addMarkerForStore(store);
          
          // Update map
          this.updateMap();
          
          // Refresh missing locations arrays
          this.processGeocodingResults();
      } else {
          this.errorMessage = `Could not geocode address: ${address}`;
        }
      });
    });
  }
  
  // Set location manually using coordinates
  setManualCoordinates(store: StoreLocation, lat: number, lng: number): void {
    if (lat === null || lng === null) return;
    
    // Update store location data
    store.lat = lat;
    store.lng = lng;
    
    // Add marker
    this.addMarkerForStore(store);
    
    // Update map
    this.updateMap();
    
    // Refresh missing locations arrays
    this.processGeocodingResults();
  }
  
  // Add a marker for a store - optimized
  addMarkerForStore(store: StoreLocation): void {
    if (!store.lat || !store.lng) return;
    
    // Check if marker already exists
    const existingMarkerIndex = this.markers.findIndex(marker => 
      Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
      Math.abs(marker.position.lng - store.lng!) < 1e-6
    );
    
    // Create simplified info window content
    const infoContent = `<div class="info-window-content">
      <h3>${store.storeName}</h3>
      <p><strong>Route:</strong> ${store.route}</p>
      <p><strong>Address:</strong> ${store.eircode}</p>
      ${store.eta ? `<p><strong>ETA:</strong> ${store.eta}</p>` : ''}
    </div>`;
    
    // If marker exists, just update info
    if (existingMarkerIndex >= 0) {
      this.markers[existingMarkerIndex].info = infoContent;
      return;
    }
    
    // Add a new marker
    this.markers.push({
      position: { lat: store.lat, lng: store.lng },
      info: infoContent
    });
  }

  // Highlight marker when hovering over table row
  highlightMarker(store: StoreLocation): void {
    if (!store.lat || !store.lng) return;
    
    // Find the marker index that corresponds to this store
    const markerIndex = this.markers.findIndex(marker => 
      Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
      Math.abs(marker.position.lng - store.lng!) < 1e-6
    );
    
    if (markerIndex >= 0) {
      this.highlightedMarkerIndex = markerIndex;
      
      // Center map on the highlighted marker for better visibility
      if (store.lat && store.lng) {
        this.center = { lat: store.lat, lng: store.lng };
      }
    }
  }
  
  // Remove highlight when mouse leaves the row
  unhighlightMarker(): void {
    this.highlightedMarkerIndex = null;
  }

  // TrackBy function for marker rendering optimization
  trackByPosition(index: number, marker: { position: google.maps.LatLngLiteral, info: string }): string {
    return `${marker.position.lat}-${marker.position.lng}`;
  }

  // Update a store's address and geocode it
  updateStoreAddress(index: number): void {
    if (index < 0 || index >= this.storeLocations.length || !this.apiLoaded) return;
    
    const store = this.storeLocations[index];
    
    // Create address query from edited values
    const addressQuery = `${this.editedAddress || ''} ${this.editedEircode || ''}`.trim();
    if (!addressQuery) {
      this.errorMessage = 'Please enter an address or eircode';
      return;
    }
    
    this.isLoading = true;
    
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: addressQuery }, (results, status) => {
      this.ngZone.run(() => {
        this.isLoading = false;
        
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const location = results[0].geometry.location;
          
          // Update store data
          store.address = this.editedAddress;
          store.eircode = this.editedEircode;
          store.lat = location.lat();
          store.lng = location.lng();
          
          // Remove old marker if it exists
          const existingMarkerIndex = this.markers.findIndex(marker => 
            Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
            Math.abs(marker.position.lng - store.lng!) < 1e-6
          );
          
          if (existingMarkerIndex >= 0) {
            this.markers.splice(existingMarkerIndex, 1);
          }
          
          // Add new marker
          this.addMarkerForStore(store);
          
          // Update map and route if already optimized
          this.updateMap();
          if (this.optimizedRoute.length > 0) {
            this.optimizeRoute();
          }
          
          // Reset editing state
          this.editingStoreIndex = null;
          this.editedAddress = '';
          this.editedEircode = '';
        } else {
          this.errorMessage = `Could not geocode address: ${addressQuery}`;
        }
      });
    });
  }
  
  // Start editing a store's address
  startEditingStore(index: number): void {
    const store = this.storeLocations[index];
    this.editingStoreIndex = index;
    this.editedAddress = store.address;
    this.editedEircode = store.eircode;
  }
  
  // Cancel editing
  cancelEditingStore(): void {
    this.editingStoreIndex = null;
    this.editedAddress = '';
    this.editedEircode = '';
  }

  // Export to Excel
  exportToExcel(): void {
    try {
      if (this.optimizedRoute.length === 0) {
        this.errorMessage = 'Please optimize the route first before exporting.';
        return;
      }
      
      this.isLoading = true;
      
      // Get sorted locations
      const sortedLocations = this.getSortedLocations();
      
      // Create workbook
      const workbook = XLSX.utils.book_new();
      
      // Prepare data for export
      const exportData = sortedLocations.map((store, index) => {
        return {
          'Stop #': store.routeOrder || '',
          'Store Name': store.storeName,
          'Quantity': store.quantity,
          'Route': store.route,
          'Eircode': store.eircode,
          'Address': store.address,
          'Opening Time': store.openingTime,
          'Has Keys': store.hasKeys ? 'Yes' : 'No',
          'Priority': store.priority ? 'Yes' : 'No',
          'ETA': store.eta || '',
          'Travel Time (mins)': store.travelTimeMinutes || ''
        };
      });
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths
      const columnWidths = [
        { wch: 8 },     // Stop #
        { wch: 25 },    // Store Name
        { wch: 10 },    // Quantity
        { wch: 15 },    // Route
        { wch: 10 },    // Eircode
        { wch: 40 },    // Address
        { wch: 15 },    // Opening Time
        { wch: 10 },    // Has Keys
        { wch: 10 },    // Priority
        { wch: 10 },    // ETA
        { wch: 18 }     // Travel Time
      ];
      
      worksheet['!cols'] = columnWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Optimized Route');
      
      // Generate filename with date
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `OptimizedRoute_${dateStr}.xlsx`;
      
      // Export file
      XLSX.writeFile(workbook, filename);
      
      this.isLoading = false;
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      this.errorMessage = 'Error exporting to Excel. Please try again.';
      this.isLoading = false;
    }
  }

  // Toggle priority for a specific store
  togglePriority(index: number): void {
    if (index >= 0 && index < this.storeLocations.length) {
      this.storeLocations[index].priority = !this.storeLocations[index].priority;
    }
  }

  // Get opening time display
  getOpeningTimeDisplay(store: StoreLocation): string {
    if (store.hasKeys) {
      return 'Keys';
    } else {
      return store.openingTime || '-';
    }
  }

  /**
   * Original optimization method kept as fallback
   */
  optimizeRouteWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // This is a simplified version of the Nearest Neighbor algorithm
        let startIdx = -1;
        let startPosition: google.maps.LatLngLiteral | null = null;
        
        // If we have a custom starting point
        if (this.startingPointMarker) {
          startPosition = this.startingPointMarker.position;
        } else if (this.markers.length > 0) {
          // Otherwise use the first location
          startIdx = 0;
          startPosition = this.markers[0].position;
        } else {
          reject(new Error('No valid starting position'));
          return;
        }
        
        // Initialize visited array and path coordinates
        const visited: number[] = [];
        this.pathCoordinates = [];
        
        // If starting with a custom point, add it to path coordinates
        if (this.startingPointMarker) {
          this.pathCoordinates.push(this.startingPointMarker.position);
        }
        
        // Create a list of unvisited points
        const unvisited: number[] = [];
        for (let i = 0; i < this.markers.length; i++) {
          if (i !== startIdx) {
            unvisited.push(i);
          }
        }
        
        if (startIdx !== -1) {
          visited.push(startIdx);
          this.pathCoordinates.push(this.markers[startIdx].position);
        }
        
        // Simple nearest neighbor algorithm
        while (unvisited.length > 0) {
          const lastPosition = this.pathCoordinates[this.pathCoordinates.length - 1];
          let nextIdx = -1;
          let minDistance = Infinity;
          
          for (const idx of unvisited) {
            const position = this.markers[idx].position;
            const distance = this.calculateDistance(lastPosition, position);
            
            if (distance < minDistance) {
              minDistance = distance;
              nextIdx = idx;
            }
          }
          
          if (nextIdx !== -1) {
            visited.push(nextIdx);
            const index = unvisited.indexOf(nextIdx);
            unvisited.splice(index, 1);
            
            this.pathCoordinates.push(this.markers[nextIdx].position);
          }
        }
        
        this.optimizedRoute = visited;
        
        // Update routeOrder property in storeLocations for sorting
        this.optimizedRoute.forEach((idx, order) => {
          if (idx >= 0 && idx < this.storeLocations.length) {
            this.storeLocations[idx].routeOrder = order + 1;
          }
        });
        
        // Calculate road-based route using Directions API
        this.calculateRoadRoute().then(() => {
          // Small delay to allow UI to update
          setTimeout(resolve, 100);
        }).catch(error => {
          console.error('Error calculating road route:', error);
          // Fallback to straight lines if directions fail
          setTimeout(resolve, 100);
        });
      } catch (error) {
        console.error('Error in route optimization algorithm:', error);
        reject(error);
      }
    });
  }

  /**
   * Original road route calculation method (used as fallback and for smaller routes)
   */
  calculateRoadRoute(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.directionsService || this.optimizedRoute.length < 1) {
        reject(new Error('Directions service not available or no route to calculate'));
        return;
      }
      
      // Clear existing path coordinates
      this.pathCoordinates = [];
      
      // Create waypoints array from optimized route
      let waypoints: google.maps.DirectionsWaypoint[] = [];
      let origin: google.maps.LatLngLiteral;
      let destination: google.maps.LatLngLiteral;
      
      // Set origin
      if (this.startingPointMarker) {
        origin = this.startingPointMarker.position;
      } else {
        const firstIdx = this.optimizedRoute[0];
        origin = this.markers[firstIdx].position;
      }
      
      // Set destination (last point in route)
      const lastIdx = this.optimizedRoute[this.optimizedRoute.length - 1];
      destination = this.markers[lastIdx].position;
      
      // Add intermediate waypoints (skip first and last as they are origin/destination)
      const waypointIndices = this.optimizedRoute.slice(
        this.startingPointMarker ? 0 : 1, 
        this.optimizedRoute.length - 1
      );
      
      waypoints = waypointIndices.map(idx => ({
        location: new google.maps.LatLng(
          this.markers[idx].position.lat, 
          this.markers[idx].position.lng
        ),
        stopover: true
      }));
      
      // Single request (assuming fewer than MAX_WAYPOINTS_PER_REQUEST waypoints)
      this.directionsService.route({
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: false, // We've already optimized
        travelMode: google.maps.TravelMode.DRIVING
      }, (response, status) => {
        if (status === google.maps.DirectionsStatus.OK && response) {
          this.processDirectionsResponse(response);
          resolve();
        } else {
          console.warn('Directions request failed:', status);
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
  }
  
  /**
   * Process Google Directions API response and extract the path coordinates
   */
  processDirectionsResponse(response: google.maps.DirectionsResult): void {
    if (response.routes && response.routes.length > 0) {
      response.routes[0].legs.forEach(leg => {
        if (leg.steps) {
          leg.steps.forEach(step => {
            if (step.path) {
              // Extract all points from the path
              step.path.forEach(path => {
                this.pathCoordinates.push({
                  lat: path.lat(),
                  lng: path.lng()
                });
              });
            }
          });
        }
      });
    }
  }

  /**
   * Create polyline options for a specific route
   */
  getPolylineOptionsForRoute(routeName: string): any {
    const defaultColor = '#2c5282'; // Default blue
    const routeColor = this.routeColorMap.get(routeName) || defaultColor;
    
    // Debug info
    console.log(`Creating polyline for route ${routeName} with color ${routeColor}`);
    
    // Create a darker version of the route color for the arrows
    // First convert the hex to RGB
    const hexToRgb = (hex: string) => {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };
    
    // Function to darken a color
    const darkenColor = (color: string, percent: number): string => {
      const rgb = hexToRgb(color);
      const darken = (c: number) => Math.max(0, Math.floor(c * (1 - percent / 100)));
      return `#${darken(rgb.r).toString(16).padStart(2, '0')}${darken(rgb.g).toString(16).padStart(2, '0')}${darken(rgb.b).toString(16).padStart(2, '0')}`;
    };
    
    // Get a darker version of the route color for better contrast
    const arrowColor = darkenColor(routeColor, 25); // 25% darker
    
    return {
      strokeColor: routeColor,
      strokeOpacity: 1.0,
      strokeWeight: 6,
      geodesic: true,
      icons: [{
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 3.5,
          strokeColor: arrowColor,
          fillColor: arrowColor,
          fillOpacity: 1
        },
        offset: '0',
        repeat: '120px'
      }]
    };
  }

  /**
   * Create separate polylines for each route
   */
  createMultiRoutePolylines(): void {
    // Clear previous route polylines
    this.routePolylines.clear();
    
    // Get unique routes (excluding 'All Routes')
    const uniqueRoutes = this.availableRoutes.filter(route => route !== 'All Routes');
    
    // If we have no routes, don't use multiple polylines
    if (uniqueRoutes.length < 1) {
      this.showMultipleRoutePolylines = false;
      return;
    }
    
    // Find the first marker for each route to use as starting point instead of global starting point
    const routeFirstMarkers: Map<string, number> = new Map();
    
    // Get first marker index for each route
    this.storeLocations.forEach((store, index) => {
      if (store.route && !routeFirstMarkers.has(store.route)) {
        routeFirstMarkers.set(store.route, index);
      }
    });
    
    // Create polylines for each route
    for (const routeName of uniqueRoutes) {
      // Filter optimized route indices to only show this route
      const filteredIndices = this.optimizedRoute.filter(idx => {
        if (idx >= 0 && idx < this.storeLocations.length) {
          return this.storeLocations[idx].route === routeName;
        }
        return false;
      });
      
      if (filteredIndices.length > 0) {
        const routePath: google.maps.LatLngLiteral[] = [];
        
        // Add starting point if it exists and we want to apply it to all routes
        if (this.startingPointMarker && this.applyStartingPointToAllRoutes) {
          routePath.push(this.startingPointMarker.position);
        }
        
        // Add filtered points for this route
        filteredIndices.forEach(idx => {
          if (idx >= 0 && idx < this.markers.length) {
            routePath.push(this.markers[idx].position);
          }
        });
        
        // Add polyline for this route if it has points
        if (routePath.length > 0) {
          this.routePolylines.set(routeName, {
            path: routePath,
            options: this.getPolylineOptionsForRoute(routeName)
          });
        }
      }
    }
    
    // Enable multiple route polylines if we have at least one
    this.showMultipleRoutePolylines = this.routePolylines.size > 0 && uniqueRoutes.length > 1;
    
    // Debug info
    console.log(`Created ${this.routePolylines.size} route polylines. showMultipleRoutePolylines=${this.showMultipleRoutePolylines}`);
    this.routePolylines.forEach((polyline, route) => {
      console.log(`Route ${route}: ${polyline.path.length} points`);
    });
  }

  /**
   * Process route chunks recursively
   */
  processChunkedRoutes(chunks: google.maps.LatLngLiteral[][], chunkIndex: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (chunkIndex >= chunks.length) {
        // All chunks processed
        resolve();
        return;
      }
      
      const chunk = chunks[chunkIndex];
      console.log(`Processing chunk ${chunkIndex+1}/${chunks.length} with ${chunk.length} points`);
      
      if (chunk.length < 2) {
        // Skip invalid chunks
        this.processChunkedRoutes(chunks, chunkIndex + 1).then(resolve).catch(reject);
        return;
      }
      
      // Set origin and destination
      const origin = chunk[0];
      const destination = chunk[chunk.length - 1];
      
      // Create waypoints from points between origin and destination
      const waypoints: google.maps.DirectionsWaypoint[] = chunk.slice(1, chunk.length - 1)
        .map(point => ({
          location: new google.maps.LatLng(point.lat, point.lng),
          stopover: true
        }));
      
      // Request directions for this chunk
      this.directionsService!.route({
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        waypoints: waypoints,
        optimizeWaypoints: false, // We've already optimized
        travelMode: google.maps.TravelMode.DRIVING
      }, (response, status) => {
        if (status === google.maps.DirectionsStatus.OK && response) {
          // Process this chunk's directions
          this.processDirectionsResponse(response);
          
          // Process next chunk
          this.processChunkedRoutes(chunks, chunkIndex + 1).then(resolve).catch(reject);
        } else {
          console.warn(`Directions request for chunk ${chunkIndex} failed:`, status);
          
          // Try to continue with next chunk anyway
          this.processChunkedRoutes(chunks, chunkIndex + 1).then(resolve).catch(reject);
        }
      });
    });
  }

  // Toggle a route's visibility (for checkbox handling in HTML)
  onRouteCheckboxChange(route: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    this.toggleRouteVisibility(route, checkbox.checked);
  }
  
  // Toggle a route's visibility
  toggleRouteVisibility(route: string, isVisible: boolean): void {
    if (isVisible) {
      this.selectedRoutes.add(route);
    } else {
      this.selectedRoutes.delete(route);
    }
    
    // Force re-render of routes if we already have an optimized route
    if (this.optimizedRoute.length > 0) {
      this.updateVisibleRoutes();
    }
  }
  
  // Update visible routes based on checkbox selection
  updateVisibleRoutes(): void {
    // Make sure multiple route display is enabled
    this.showMultipleRoutePolylines = true;
    
    // Filter the routePolylines map to only include selected routes
    // First ensure the polylines are created for all routes
    this.createMultiRoutePolylines();
    
    // Set forceDrivingDirections to true to force recalculation
    this.recalculateSelectedRoutesDirections();
  }
  
  // Recalculate driving directions for all selected routes
  recalculateSelectedRoutesDirections(): void {
    if (this.selectedRoutes.size === 0) {
      return;
    }
    
    // Show loading state
    this.isLoading = true;
    
    // Create an array of promises
    const promisesArray = Array.from(this.selectedRoutes).map(routeName => {
      const polyline = this.routePolylines.get(routeName);
      if (polyline && polyline.path.length > 1) {
        return this.calculateRoadRouteForPath(polyline.path, routeName);
      }
      return Promise.resolve();
    });
    
    // Wait for all promises to resolve
    Promise.all(promisesArray)
      .then(() => {
        this.isLoading = false;
        console.log("All selected routes have been recalculated with driving directions");
      })
      .catch(error => {
        console.error("Error recalculating route directions:", error);
        this.isLoading = false;
      });
  }
  
  // Get visible routes for the map
  getVisibleRoutePolylines(): Map<string, { path: google.maps.LatLngLiteral[], options: any }> {
    // If not using multiple routes or no routes are selected
    if (!this.showMultipleRoutePolylines || this.selectedRoutes.size === 0) {
      return new Map();
    }
    
    // Return only the polylines for selected routes
    const visiblePolylines = new Map<string, { path: google.maps.LatLngLiteral[], options: any }>();
    
    // Only include routes that are in the selectedRoutes set
    this.routePolylines.forEach((value, key) => {
      if (this.selectedRoutes.has(key)) {
        visiblePolylines.set(key, value);
      }
    });
    
    return visiblePolylines;
  }

  // Get route start time
  getRouteStartTime(route: string): string {
    return this.routeSettings.get(route)?.startTime || this.startTime;
  }
  
  // Set route start time and recalculate ETAs
  setRouteStartTime(route: string, time: string): void {
    if (this.routeSettings.has(route)) {
      const settings = this.routeSettings.get(route)!;
      settings.startTime = time;
      this.routeSettings.set(route, settings);
      
      // Recalculate ETAs if we have an optimized route
      if (this.optimizedRoute.length > 0) {
        this.calculateETAs();
      }
    }
  }
} 