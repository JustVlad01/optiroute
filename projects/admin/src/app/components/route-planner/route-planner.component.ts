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
  displayOrder?: number; // Display order for UI
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
  showPath: boolean;
  showPoints: boolean;
}

// Interface for geocoded addresses
interface GeocodedAddress {
  query: string;
  lat: number;
  lng: number;
  hasMarker: boolean;
  markerId?: number;
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
  mapOptions: google.maps.MapOptions = {
    mapTypeControl: true,
    fullscreenControl: true,
    streetViewControl: true,
    mapTypeId: 'roadmap',
    maxZoom: 25,
    minZoom: 6
  };
  mapMarkerOptions = {
    draggable: false,
    animation: null // Remove drop animation
  };
  markers: { 
    position: google.maps.LatLngLiteral, 
    info: string, 
    options?: any, 
    addressRef?: GeocodedAddress 
  }[] = [];
  pathCoordinates: google.maps.LatLngLiteral[] = [];
  polylineOptions = {
    strokeColor: '#2c5282',
    strokeOpacity: 0.85,
    strokeWeight: 5,
    clickable: false,
    draggable: false,
    editable: false,
    visible: true,
    zIndex: 1,
    geodesic: true,
    strokeLinecap: 'round',
    strokeLineJoin: 'round'
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
  
  // Default route colors array for cycling through colors
  routeColors: string[] = [
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
  
  // Properties for route visibility checkboxes
  selectedRoutes: Set<string> = new Set();
  
  // Route-specific settings
  routeSettings: Map<string, RouteSettings> = new Map();
  
  // Cache for route marker icons to improve performance
  private routeMarkerIcons: Map<string, google.maps.Symbol> = new Map();
  
  // Track expanded route sections in the table
  private expandedRoutes: Set<string> = new Set();

  // Geocoding tool properties
  geocodingToolExpanded = true;
  batchGeocodingInput = '';
  isGeocoding = false;
  geocodedAddresses: GeocodedAddress[] = [];
  geocodingMarkers: { 
    id: number; 
    marker: { 
      position: google.maps.LatLngLiteral, 
      info: string,
      options?: any,
      addressRef?: GeocodedAddress 
    } 
  }[] = [];
  private nextGeocodingMarkerId = 1;

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
            visible: true,
            showPath: true,
            showPoints: true
          });
        }
      }
    });
    
    // Initialize marker icons with the new circle style
    this.initializeRouteMarkerIcons();
    
    // Expand the first few routes by default (for better UX)
    this.expandedRoutes.clear();
    const routesToExpandByDefault = Math.min(3, this.availableRoutes.length - 1); // Expand up to 3 routes
    
    for (let i = 1; i <= routesToExpandByDefault; i++) {
      if (this.availableRoutes[i]) {
        this.expandedRoutes.add(this.availableRoutes[i]);
      }
    }
  }

  // Change selected route - now supports multiple routes
  changeRoute(route: string): void {
    // We keep this method for backward compatibility
    
    if (route === 'All Routes') {
      // When 'All Routes' is selected, select all routes
      this.selectAllRoutes();
    } else {
      // When a specific route is selected, select only that route
      this.selectedRoutes.clear();
      this.selectedRoutes.add(route);
    }
    
    // Update map to show selected routes
    this.applySelectedRoutes();
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
    // Filter by selected routes
    let filteredLocations = this.storeLocations;
    
    // If we have specific routes selected, filter to only show those
    if (this.selectedRoutes.size > 0 && this.selectedRoutes.size < this.availableRoutes.length - 1) {
      filteredLocations = this.storeLocations.filter(store => 
        this.selectedRoutes.has(store.route)
      );
    }
    
    if (this.optimizedRoute.length === 0) {
      // If no optimization, show original order
      return filteredLocations;
    }
    
    // Create a copy to sort
    const sorted = [...filteredLocations].sort((a, b) => {
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
    
    // For each route, ensure display order starts from 1
    if (this.selectedRoutes.size > 0) {
      // Group by route
      const routeGroups: Map<string, StoreLocation[]> = new Map();
      
      sorted.forEach(store => {
        if (!routeGroups.has(store.route)) {
          routeGroups.set(store.route, []);
        }
        routeGroups.get(store.route)!.push(store);
      });
      
      // For each route, set display order
      routeGroups.forEach(stores => {
        stores.sort((a, b) => {
          if (a.routeOrder !== undefined && b.routeOrder !== undefined) {
            return a.routeOrder - b.routeOrder;
          }
          return 0;
        });
        
        // Assign display order starting from 1 for each route
        stores.forEach((store, index) => {
          store.displayOrder = index + 1;
        });
      });
    } else {
      // If no specific routes selected, use the global routeOrder
      sorted.forEach(store => {
        store.displayOrder = store.routeOrder;
      });
    }
    
    return sorted;
  }

  // Get route-specific marker options - optimized for performance
  getMarkerOptions(index: number): google.maps.MarkerOptions {
    // If index is valid for a store location
    if (index >= 0 && index < this.storeLocations.length) {
      const store = this.storeLocations[index];
      const route = store.route;
      
      // Base marker options
      let markerOptions: google.maps.MarkerOptions = { ...this.normalMarkerOptions };
      
      // If we have a route and this is a highlighted marker
      if (index === this.highlightedMarkerIndex) {
        markerOptions = { ...this.highlightedMarkerOptions };
      } 
      // Regular marker with route-specific color
      else if (route && this.routeMarkerIcons.has(route)) {
        markerOptions.icon = this.routeMarkerIcons.get(route);
      }
      
      // Add the sequence number as a centered label if route is optimized
      if (this.optimizedRoute.length > 0 && store.routeOrder !== undefined) {
        // Always use displayOrder for consistency with the table
        let sequenceNumber;
        if (this.selectedRoutes.has(route)) {
          // Always use displayOrder for route-specific view
          sequenceNumber = store.displayOrder;
        } else {
          // Don't show sequence number for stores not in selected routes
          sequenceNumber = null;
        }
        
        if (sequenceNumber !== null && sequenceNumber !== undefined) {
          markerOptions.label = {
            text: sequenceNumber.toString(),
            color: '#000000', // Black text for better visibility
            fontWeight: 'bold',
            fontSize: '12px',
            className: 'marker-label'
          };
        }
      }
      
      return markerOptions;
    }
    
    // For any other markers (like starting point)
    return this.normalMarkerOptions;
  }

  // Update visible markers based on selected routes and point visibility settings
  getVisibleMarkers(): { position: google.maps.LatLngLiteral, info: string, options?: any, addressRef?: GeocodedAddress }[] {
    // Start with all geocoding markers (these should always be visible)
    const geocodingMarkers = this.geocodingMarkers.map(m => m.marker);
    
    // If no routes are selected, return only geocoding markers
    if (this.selectedRoutes.size === 0) {
      return geocodingMarkers;
    }
    
    // Filter regular markers that correspond to the selected routes with visible points
    const storeMarkers = this.markers.filter((marker, idx) => {
      // Skip geocoding markers (which don't have corresponding store locations)
      const isGeocodingMarker = marker.addressRef !== undefined;
      if (isGeocodingMarker) return false;
      
      // First check if this is a marker for a store (could be starting point marker)
      if (idx < this.storeLocations.length) {
        const route = this.storeLocations[idx].route;
        const settings = this.routeSettings.get(route);
        
        // Show if route is selected AND points are visible for that route
        return this.selectedRoutes.has(route) && 
               settings && 
               settings.showPoints;
      }
      return false;
    });
    
    // Combine geocoding markers with filtered store markers
    return [...geocodingMarkers, ...storeMarkers];
  }

  // Check if store should be shown based on selected routes
  shouldShowStore(store: StoreLocation): boolean {
    // Show store if its route is in the selectedRoutes set
    return this.selectedRoutes.has(store.route);
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
                        </div>`,
                  options: {
                    draggable: true,
                    animation: null,
                    icon: {
                      path: google.maps.SymbolPath.CIRCLE,
                      fillColor: '#e53e3e',
                      fillOpacity: 1,
                      strokeColor: '#ffffff',
                      strokeWeight: 2,
                      scale: 8
                    }
                  },
                  addressRef: {
                    query: addressQuery,
                    lat: location.lat(),
                    lng: location.lng(),
                    hasMarker: false
                  }
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
      // Always refresh the marker info before showing the info window
      // to ensure we display the latest sequence numbers
      this.updateMarkerInfo();
      
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
    if (this.isOptimizing) {
      return;
    }
    
    this.isOptimizing = true;
    
    // Reset optimization results
    this.optimizedRoute = [];
    this.pathCoordinates = [];
    
    // Don't display only markers during optimization
    this.displayMarkersOnly = false;
    
    // Setup for each route
    if (this.storeLocations.length === 0) {
      this.errorMessage = 'Please import store locations first';
      this.isOptimizing = false;
      return;
    }
    
    // Check if we have a starting point
    const hasStartingPoint = this.startingPointMarker !== null;
    
    // If we have multiple routes and they should be optimized separately
    if (this.getUniqueRoutes().length > 1 && !this.applyStartingPointToAllRoutes) {
      // Show all route polylines for multi-route mode
      this.showMultipleRoutePolylines = true;
      
      // Optimize each route separately
      this.optimizeEachRouteSeparately().then(() => {
        // Ensure we always follow road paths
        this.recalculateSelectedRoutesDirections();
        
        console.log('All routes optimized separately');
        this.isOptimizing = false;
      }).catch(error => {
        console.error('Error optimizing routes separately:', error);
        this.errorMessage = 'Error optimizing routes: ' + error.message;
        this.isOptimizing = false;
      });
    } else {
      // Optimize the route based on the starting point and all visible locations
      this.optimizeWithDistanceMatrix();
      
      // After optimization, calculate the road route to follow actual road paths
      setTimeout(() => {
        this.calculateChunkedRoadRoute().then(() => {
          console.log('Road route calculated');
          this.isOptimizing = false;
        }).catch(error => {
          console.error('Error calculating road route:', error);
          this.errorMessage = 'Error calculating road route: ' + error.message;
          // Still mark as not optimizing, as we've completed the optimization part
          this.isOptimizing = false;
        });
      }, 500); // Small delay to ensure optimization is complete
    }
  }

  // New helper method to ensure route sequence numbers are refreshed
  refreshRouteSequenceNumbers(): void {
    // For each route, ensure displayOrder is set correctly
    const routes = this.getUniqueRoutes();
    
    routes.forEach(route => {
      const routeStores = this.storeLocations.filter(store => store.route === route);
      
      if (routeStores.length === 0) return;
      
      // Sort by routeOrder first
      const sortedStores = [...routeStores].sort((a, b) => {
        if (a.routeOrder !== undefined && b.routeOrder !== undefined) {
          return a.routeOrder - b.routeOrder;
        } else if (a.routeOrder !== undefined) {
          return -1;
        } else if (b.routeOrder !== undefined) {
          return 1;
        }
        return 0;
      });
      
      // Set displayOrder starting from 1
      sortedStores.forEach((store, index) => {
        store.displayOrder = index + 1;
      });
    });
    
    // Update marker info windows to ensure they show the correct sequence
    this.updateMarkerInfo();
    
    // Force marker refresh by re-creating the markers array
    // This ensures the marker labels are updated with the new display order
    setTimeout(() => {
      this.markers = [...this.markers];
    }, 50);
    
    // Force refresh of UI by expanding routes
    routes.forEach(route => {
      this.expandedRoutes.add(route);
    });
  }

  /**
   * Optimize each route separately using Google's Directions API
   */
  optimizeEachRouteSeparately(): Promise<void> {
    // Get all route names
    const routes = Array.from(this.routePolylines.keys());
    
    if (routes.length === 0) {
      return Promise.resolve();
    }
    
    console.log(`Optimizing ${routes.length} routes individually`);
    
    // Create an array of promises
    const optimizationPromises = routes.map(routeName => {
      const polyline = this.routePolylines.get(routeName);
      if (polyline && polyline.path.length > 1) {
        return this.calculateOptimalRouteForPath(polyline.path, routeName);
      }
      return Promise.resolve();
    });
    
    // Wait for all promises to resolve
    return Promise.all(optimizationPromises).then(() => {
      console.log('All routes have been individually optimized');
      
      // Make sure route display order is updated for all routes
      this.refreshRouteSequenceNumbers();
      
      // Update marker information to reflect sequence numbers
      this.updateMarkerInfo();
      
      // Expand all routes to show the updated sequences
      this.getUniqueRoutes().forEach(route => {
        this.expandedRoutes.add(route);
      });
      
      return Promise.resolve();
    });
  }

  /**
   * Primary optimization method using Distance Matrix API
   */
  private optimizeWithDistanceMatrix(): void {
    try {
      // Clear any previous optimizations
      this.optimizedRoute = [];
      this.pathCoordinates = [];
      this.routePolylines.clear();
      
      console.log('Starting route optimization with distance matrix...');
      
      // Optimize using the distance matrix
      this.optimizeRouteWithDistanceMatrix()
        .then(() => {
          // Create path coordinates and calculate ETAs
          // These will be done inside the calculateRoadRoute/calculateChunkedRoadRoute methods
          console.log('Route optimization complete. Creating route polylines...');
          
          // Ensure route polylines are visible
          this.displayMarkersOnly = false;
          
          // Create multiple route polylines if needed
          const uniqueRoutes = this.getUniqueRoutes();
          if (uniqueRoutes.length > 1) {
            this.showMultipleRoutePolylines = true;
            this.createMultiRoutePolylines();
          }
          
          // Calculate ETAs for each stop
          this.calculateETAs();
          
          // Update info windows for markers
          this.updateMarkerInfo();
          
          // Make sure route display orders are updated
          this.refreshRouteSequenceNumbers();
          
          // Expand all routes to show updated sequence
          this.getUniqueRoutes().forEach(route => {
            this.expandedRoutes.add(route);
          });
          
          // Done with optimization
          this.isLoading = false;
          this.isOptimizing = false;
          
          console.log('Route optimization and visualization complete.');
        })
        .catch(error => {
          console.error('Route optimization error:', error);
          this.errorMessage = 'Error optimizing route. Please try again.';
          this.isLoading = false;
          this.isOptimizing = false;
          
          // Fallback to simple optimization if distance matrix fails
          console.log('Attempting fallback optimization...');
          this.optimizeRouteWorker().then(() => {
            this.calculateETAs();
            this.updateMarkerInfo();
            this.refreshRouteSequenceNumbers();
            
            // Ensure polylines are visible
            this.displayMarkersOnly = false;
            this.createMultiRoutePolylines();
            
            const uniqueRoutes = this.getUniqueRoutes();
            this.showMultipleRoutePolylines = uniqueRoutes.length > 1;
            
            // Expand all routes to show updated sequence
            uniqueRoutes.forEach(route => {
              this.expandedRoutes.add(route);
            });
          });
        });
    } catch (error) {
      console.error('Error in optimizeWithDistanceMatrix:', error);
      this.errorMessage = 'Error starting optimization. Please try again.';
      this.isLoading = false;
      this.isOptimizing = false;
    }
  }

  /**
   * Optimize route using the precomputed distance matrix
   * Uses a simple greedy algorithm (Nearest Neighbor)
   * Priorities are handled by sorting and considering opening times if enabled
   */
  optimizeRouteWithDistanceMatrix(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        // Find start index
        const locations = this.markers.map(marker => marker.position);
        let startIdx = -1;
        
        // If we have a starting point marker, use it as the starting point
        if (this.startingPointMarker) {
          startIdx = 0; // Starting point marker is always first
          locations.unshift(this.startingPointMarker.position);
        } else if (this.markers.length > 0) {
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
        
        // Remove opening times consideration - we'll ignore this flag completely
        // if (this.considerOpeningTimes) {
        //   // Sort unvisited based on opening times
        //   // ...
        // }
        
        // Find nearest neighbor for each step using the distance matrix
        while (unvisited.length > 0) {
          let nearest = -1;
          let minDistance = Infinity;
            
          for (const point of unvisited) {
            // Get distance from current to this point
            const distance = this.distanceMatrix[current][point];
            
            // Remove opening times consideration
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
      
        // Apply 2-opt improvement algorithm to refine the route
        this.apply2OptImprovement(visited);
        
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

        // Update displayOrder for all routes
        this.refreshRouteSequenceNumbers();
        
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
      
        // Always calculate road-based route using Directions API
        this.calculateChunkedRoadRoute().then(() => {
          // Make sure polylines are visible
          this.showMultipleRoutePolylines = this.getUniqueRoutes().length > 1;
          
          // Force a refresh of the table ordering
          this.refreshRouteSequenceNumbers();
          this.updateMarkerInfo();
          
          // Force UI update to reflect the changes in the table
          setTimeout(() => {
            // Force marker refresh
            this.markers = [...this.markers];
            
            // Expand all routes to show the updated order
            this.getUniqueRoutes().forEach(route => {
              this.expandedRoutes.add(route);
            });
          }, 100);
          
          setTimeout(resolve, 200);
        }).catch(error => {
          console.error('Error calculating road route:', error);
          // Even if directions fail, try again with different approach
          this.calculateRoadRoute().then(() => {
            // Force a refresh of the table ordering
            this.refreshRouteSequenceNumbers();
            this.updateMarkerInfo();
            
            // Force UI update
            setTimeout(() => {
              // Force marker refresh
              this.markers = [...this.markers];
              
              // Expand all routes to show the updated order
              this.getUniqueRoutes().forEach(route => {
                this.expandedRoutes.add(route);
              });
            }, 100);
            
            setTimeout(resolve, 200);
          }).catch(err => {
            console.error('Both road route calculation methods failed:', err);
            // Fallback to straight lines
            setTimeout(resolve, 100);
          });
        });
      } catch (error) {
        console.error('Error in optimizeRouteWithDistanceMatrix:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Apply the 2-opt improvement algorithm to refine the route
   * This algorithm looks for route segments that cross and uncrosses them to improve the route
   */
  apply2OptImprovement(route: number[]): void {
    if (route.length < 4) {
      // Need at least 4 points to apply 2-opt
      return;
    }
    
    const MAX_ITERATIONS = 100;
    let improvement = true;
    let iteration = 0;
    
    // Continue until no more improvements can be made or max iterations reached
    while (improvement && iteration < MAX_ITERATIONS) {
      improvement = false;
      iteration++;
      
      // Try all possible 2-opt swaps and pick the best one
      for (let i = 1; i < route.length - 2; i++) {
        for (let j = i + 1; j < route.length - 1; j++) {
          // Calculate current distance
          const currentDistance = 
            this.distanceMatrix[route[i-1]][route[i]] + 
            this.distanceMatrix[route[j]][route[j+1]];
          
          // Calculate distance after swap
          const newDistance = 
            this.distanceMatrix[route[i-1]][route[j]] + 
            this.distanceMatrix[route[i]][route[j+1]];
          
          // If the swap improves the route, apply it
          if (newDistance < currentDistance) {
            // Reverse the segment between i and j
            this.reverseSegment(route, i, j);
            improvement = true;
            // Break and start over with the new route
            break;
          }
        }
        if (improvement) {
          break;
        }
      }
    }
    
    console.log(`2-opt algorithm completed after ${iteration} iterations`);
  }
  
  /**
   * Reverse a segment of the route (used by 2-opt algorithm)
   */
  reverseSegment(route: number[], i: number, j: number): void {
    // Reverse the segment between i and j (inclusive)
    while (i < j) {
      const temp = route[i];
      route[i] = route[j];
      route[j] = temp;
      i++;
      j--;
    }
  }

  /**
   * Calculate a road-based route by splitting into chunks if needed
   */
  calculateChunkedRoadRoute(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Skip if path is empty or we don't have the Directions Service
      if (this.pathCoordinates.length < 2 || !this.directionsService) {
        console.log('Skipping road route calculation - not enough points or no directions service');
        reject(new Error('No valid path to calculate or directions service unavailable'));
        return;
      }

      try {
        // If we have more than the maximum waypoints allowed, split into chunks
        const maxSize = this.MAX_WAYPOINTS_PER_REQUEST + 1; // +1 for the destination
        
        if (this.pathCoordinates.length > maxSize) {
          // Split the route into chunks of waypoints (maximum waypoints per request is 23)
          const chunks: google.maps.LatLngLiteral[][] = [];
          let currentChunk: google.maps.LatLngLiteral[] = [];
          
          // First point is always origin
          currentChunk.push(this.pathCoordinates[0]);
          
          // Add waypoints
          for (let i = 1; i < this.pathCoordinates.length - 1; i++) {
            // If current chunk is full, finalize it and start a new one
            if (currentChunk.length >= maxSize) {
              // Add last point as destination
              currentChunk.push(this.pathCoordinates[i]);
              chunks.push(currentChunk);
              
              // Start new chunk with this destination as new origin
              currentChunk = [this.pathCoordinates[i]];
            } else {
              // Add to current chunk
              currentChunk.push(this.pathCoordinates[i]);
            }
          }
          
          // Add last point
          if (this.pathCoordinates.length > 1) {
            currentChunk.push(this.pathCoordinates[this.pathCoordinates.length - 1]);
          }
          
          // Add final chunk if not empty
          if (currentChunk.length > 1) {
            chunks.push(currentChunk);
          }
          
          console.log(`Split route into ${chunks.length} chunks`);
          
          // Process chunks sequentially
          this.processChunkedRoutes(chunks, 0)
            .then(() => {
              // Always ensure polylines are shown for visualization
              this.displayMarkersOnly = false;
              if (this.getUniqueRoutes().length > 1) {
                this.showMultipleRoutePolylines = true;
                this.createMultiRoutePolylines();
              }
              resolve();
            })
            .catch(reject);
        } else {
          // Simple case - just calculate route for all points
          this.calculateRoadRoute()
            .then(() => {
              // Always ensure polylines are shown for visualization
              this.displayMarkersOnly = false;
              if (this.getUniqueRoutes().length > 1) {
                this.showMultipleRoutePolylines = true;
                this.createMultiRoutePolylines();
              }
              resolve();
            })
            .catch(reject);
        }
      } catch (error) {
        console.error('Error in calculateChunkedRoadRoute:', error);
        reject(error);
      }
    });
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
              stopover: true
            }));
            
            const request = {
              origin,
              destination,
              waypoints,
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: true
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
          stopover: true
        }));
        
        const request = {
          origin,
          destination,
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true
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
    // First, assign display orders to all stores based on their route
    const routeGroups: Map<string, StoreLocation[]> = new Map();
    
    // Group stores by route
    this.storeLocations.forEach(store => {
      if (!routeGroups.has(store.route)) {
        routeGroups.set(store.route, []);
      }
      routeGroups.get(store.route)!.push(store);
    });
    
    // Assign route-specific displayOrder to each store
    routeGroups.forEach((stores, routeName) => {
      // Sort stores by routeOrder
      const sortedStores = [...stores].sort((a, b) => {
        if (a.routeOrder !== undefined && b.routeOrder !== undefined) {
          return a.routeOrder - b.routeOrder;
        } else if (a.routeOrder !== undefined) {
          return -1;
        } else if (b.routeOrder !== undefined) {
          return 1;
        }
        return 0;
      });
      
      // Assign display order starting from 1 for each route
      sortedStores.forEach((store, index) => {
        store.displayOrder = index + 1;
      });
    });
    
    // Update marker info windows with new ETAs and route-specific display order
    this.storeLocations.forEach(store => {
      if (store.lat && store.lng) {
        const markerIndex = this.markers.findIndex(marker => 
          Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
          Math.abs(marker.position.lng - store.lng!) < 1e-6
        );
        
        if (markerIndex >= 0) {
          // Use the displayOrder for consistency with the table and map markers
          let sequenceNumber;
          if (this.selectedRoutes.has(store.route) && store.displayOrder !== undefined) {
            sequenceNumber = store.displayOrder;
          } else {
            sequenceNumber = null; // Don't show for routes not selected
          }
          
          const orderText = sequenceNumber ? 
            `<p><strong>Stop #:</strong> ${sequenceNumber}</p>` : '';
          
          // Add opening time information
          const openingTimeText = store.openingTime ? 
            `<p><strong>Opening Time:</strong> ${this.getOpeningTimeDisplay(store)}</p>` : '';
          
          // Add travel time from previous stop if available
          const travelTimeText = store.travelTimeMinutes ? 
            `<p><strong>Travel Time:</strong> ${store.travelTimeMinutes} mins</p>` : '';
          
          this.markers[markerIndex].info = `<div class="info-window-content">
            <h3>${store.storeName}</h3>
            ${orderText}
            <p><strong>Route:</strong> ${store.route}</p>
            <p><strong>Address:</strong> ${store.eircode}</p>
            ${openingTimeText}
            ${store.eta ? `<p><strong>ETA:</strong> ${store.eta}</p>` : ''}
            ${travelTimeText}
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
    
    // Use the same displayOrder for consistency
    let sequenceNumber = null;
    if (this.selectedRoutes.has(store.route) && store.displayOrder !== undefined) {
      sequenceNumber = store.displayOrder;
    }
    
    const orderText = sequenceNumber ? 
      `<p><strong>Stop #:</strong> ${sequenceNumber}</p>` : '';
    
    // Create info window content with opening time
    const openingTimeText = store.openingTime ? 
      `<p><strong>Opening Time:</strong> ${this.getOpeningTimeDisplay(store)}</p>` : '';
    
    // Create travel time text if available
    const travelTimeText = store.travelTimeMinutes ? 
      `<p><strong>Travel Time:</strong> ${store.travelTimeMinutes} mins</p>` : '';
    
    // Create simplified info window content
    const infoContent = `<div class="info-window-content">
      <h3>${store.storeName}</h3>
      ${orderText}
      <p><strong>Route:</strong> ${store.route}</p>
      <p><strong>Address:</strong> ${store.eircode}</p>
      ${openingTimeText}
      ${store.eta ? `<p><strong>ETA:</strong> ${store.eta}</p>` : ''}
      ${travelTimeText}
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
        optimizeWaypoints: true, // Use Google's built-in optimization
        travelMode: google.maps.TravelMode.DRIVING
      }, (response, status) => {
        if (status === google.maps.DirectionsStatus.OK && response) {
          this.processDirectionsResponse(response);
          
          // If waypoints were optimized, update our route order
          if (response.routes && response.routes.length > 0 && response.routes[0].waypoint_order) {
            this.updateRouteFromWaypointOrder(response.routes[0].waypoint_order, waypointIndices);
          }
          
          resolve();
        } else {
          console.warn('Directions request failed:', status);
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
  }
  
  /**
   * Update the optimized route based on the waypoint order returned by the Directions API
   */
  updateRouteFromWaypointOrder(waypointOrder: number[], waypointIndices: number[]): void {
    // Create a new optimized route array
    const newOptimizedRoute: number[] = [];
    
    // Add the first point if we're not using a starting point marker
    if (!this.startingPointMarker && this.optimizedRoute.length > 0) {
      newOptimizedRoute.push(this.optimizedRoute[0]);
    }
    
    // Add the waypoints in the optimized order
    waypointOrder.forEach(waypointIdx => {
      newOptimizedRoute.push(waypointIndices[waypointIdx]);
    });
    
    // Add the last point
    if (this.optimizedRoute.length > 0) {
      newOptimizedRoute.push(this.optimizedRoute[this.optimizedRoute.length - 1]);
    }
    
    // Update the optimized route
    this.optimizedRoute = newOptimizedRoute;
    
    // Update routeOrder property in storeLocations for sorting
    this.optimizedRoute.forEach((idx, order) => {
      if (idx >= 0 && idx < this.storeLocations.length) {
        this.storeLocations[idx].routeOrder = order + 1;
      }
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
   * Get polyline options for a specific route
   */
  getPolylineOptionsForRoute(routeName: string): any {
    const color = this.routeColorMap.get(routeName) || this.routeColors[0];
    
    // Create a more visible polyline with an outline effect
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };
    
    const darken = (c: number) => Math.max(0, Math.floor(c * (1 - 25 / 100)));
    
    return {
      strokeColor: color,
      strokeOpacity: 0.85,
      strokeWeight: 5,
      clickable: false,
      draggable: false,
      editable: false,
      visible: true,
      zIndex: 1,
      geodesic: true,
      strokeLinecap: 'round',
      strokeLineJoin: 'round'
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
    
    // Create polylines for each route
    for (const routeName of uniqueRoutes) {
      // Filter store locations for this route
      const routeStoreLocations = this.storeLocations.filter(store => store.route === routeName);
      
      if (routeStoreLocations.length === 0) continue;
      
      // Get filtered point indices for this route
      const routePointIndices = this.storeLocations
        .map((store, index) => ({ index, store }))
        .filter(item => item.store.route === routeName)
        .map(item => item.index);
      
      if (routePointIndices.length === 0) continue;
      
      // Get actual points for this route
      const routePoints: google.maps.LatLngLiteral[] = [];
      
      // Add starting point if it exists and we want to apply it to all routes
      if (this.startingPointMarker && this.applyStartingPointToAllRoutes) {
        routePoints.push(this.startingPointMarker.position);
      }
      
      // Add all points for this route
      routePointIndices.forEach(idx => {
        if (idx >= 0 && idx < this.markers.length) {
          routePoints.push(this.markers[idx].position);
        }
      });
      
      // Add temporary polyline for this route if it has points
      if (routePoints.length > 0) {
        // Initially create placeholder polyline with minimal points 
        // (will be replaced with actual road path)
        this.routePolylines.set(routeName, {
          path: routePoints.length > 1 ? [routePoints[0], routePoints[routePoints.length - 1]] : routePoints,
          options: this.getPolylineOptionsForRoute(routeName)
        });
        
        // Immediately calculate the road-based path instead of using straight lines
        if (routePoints.length > 1) {
          this.calculateRoadRouteForPath(routePoints, routeName)
            .catch(error => console.error(`Error calculating road route for ${routeName}:`, error));
        }
      }
    }
    
    // Enable multiple route polylines if we have at least one
    this.showMultipleRoutePolylines = this.routePolylines.size > 0 && uniqueRoutes.length > 1;
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
    
    if (checkbox.checked) {
      this.selectedRoutes.add(route);
      
      // Initialize display settings if needed
      if (!this.routeSettings.has(route)) {
        this.routeSettings.set(route, {
          startTime: this.startTime,
          visible: true,
          showPath: true,
          showPoints: true
        });
      } else {
        // Make sure display options are enabled when route is selected
        const settings = this.routeSettings.get(route)!;
        if (!settings.showPath && !settings.showPoints) {
          settings.showPath = true;
          settings.showPoints = true;
          this.routeSettings.set(route, settings);
        }
      }
    } else {
      this.selectedRoutes.delete(route);
    }
    
    // Force re-render of routes if we already have an optimized route
    if (this.optimizedRoute.length > 0) {
      this.updateVisibleRoutes();
    }
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
  
  /**
   * Recalculate the directions for all selected routes
   */
  recalculateSelectedRoutesDirections(): void {
    if (this.selectedRoutes.size === 0) {
      console.log('No routes selected to recalculate');
      return;
    }
    
    // Track completion for all routes
    const totalRoutes = this.selectedRoutes.size;
    let completedRoutes = 0;
    
    // Create a promise array for all route calculations
    const promises: Promise<void>[] = [];
    
    // Process each selected route
    this.selectedRoutes.forEach(route => {
      const routeLocations = this.getStoresForRoute(route);
      
      // Skip empty routes
      if (routeLocations.length === 0) {
        completedRoutes++;
        return;
      }
      
      // Get stores in optimized order (if available)
      const sortedStores = routeLocations.sort((a, b) => {
        // If we have route order, use it
        if (a.routeOrder !== undefined && b.routeOrder !== undefined) {
          return a.routeOrder - b.routeOrder;
        }
        // Otherwise, use any existing order
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      });
      
      // Extract path from sorted stores
      const path = sortedStores.map(store => ({
        lat: store.lat!,
        lng: store.lng!
      }));
      
      // Add starting point if we have one and it should be applied to all routes
      if (this.startingPointMarker && this.applyStartingPointToAllRoutes) {
        path.unshift(this.startingPointMarker.position);
      }
      
      // Skip if path is too short
      if (path.length < 2) {
        completedRoutes++;
        return;
      }
      
      // Calculate road route using Google Maps Directions API
      const promise = this.calculateRoadRouteForPath(path, route).then(() => {
        completedRoutes++;
        console.log(`Completed road route for ${route}: ${completedRoutes}/${totalRoutes}`);
      }).catch(error => {
        completedRoutes++;
        console.error(`Error calculating road route for ${route}:`, error);
      });
      
      promises.push(promise);
    });
    
    // Wait for all route calculations to complete
    Promise.all(promises).then(() => {
      console.log('All route directions recalculated');
      this.isOptimizing = false;
    }).catch(error => {
      console.error('Error recalculating route directions:', error);
      this.isOptimizing = false;
    });
  }
  
  /**
   * Calculate optimal route for a specific path - with more aggressive optimization
   */
  calculateOptimalRouteForPath(path: google.maps.LatLngLiteral[], routeName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (path.length < 2) {
        console.warn(`Path too short for route ${routeName}: ${path.length} points`);
        resolve();
        return;
      }
      
      console.log(`Optimizing route for ${routeName} with ${path.length} points`);
      
      // Ensure we're using a valid DirectionsService instance
      if (!this.directionsService) {
        this.directionsService = new google.maps.DirectionsService();
      }
      
      try {
        // The starting point should always be the warehouse/depot
        const origin = this.startingPointMarker ? this.startingPointMarker.position : path[0];
        
        // The destination can be the last stop
        const destination = path[path.length - 1];
        
        // All other points are waypoints
        const waypoints = path.slice(this.startingPointMarker ? 0 : 1, path.length - 1).map(point => ({
          location: new google.maps.LatLng(point.lat, point.lng),
          stopover: true
        }));
        
        console.log(`Route ${routeName}: ${waypoints.length} waypoints between origin and destination`);
        
        // If we have a lot of waypoints, we need to chunk the requests
        if (waypoints.length > this.MAX_WAYPOINTS_PER_REQUEST) {
          console.log(`Route ${routeName} has too many waypoints, chunking requests`);
          this.calculateRoadRouteForPath(path, routeName)
            .then(() => {
              // After calculating the route, ensure route sequence numbers are updated
              this.updateRouteSpecificSequence(routeName);
              resolve();
            })
            .catch(reject);
          return;
        }
        
        // Single request for route optimization
        this.directionsService.route({
          origin: new google.maps.LatLng(origin.lat, origin.lng),
          destination: new google.maps.LatLng(destination.lat, destination.lng),
          waypoints: waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true,  // This is the key to let Google optimize the route
          avoidHighways: false,     // Don't avoid highways
          avoidTolls: false,        // Don't avoid toll roads
          provideRouteAlternatives: true  // Ask for multiple route options
        }, (response, status) => {
          if (status === google.maps.DirectionsStatus.OK && response) {
            // If we have multiple routes, use the shortest one
            const bestRoute = this.findBestRoute(response);
            const routePath = this.extractPathFromDirectionsResponse(response);
            
            // Update the route polyline
            this.routePolylines.set(routeName, {
              path: routePath,
              options: this.getPolylineOptionsForRoute(routeName)
            });
            
            console.log(`Created optimized polyline for route ${routeName} with ${routePath.length} points`);
            
            // Update route-specific sequence numbers
            this.updateRouteSpecificSequence(routeName);
            
            resolve();
          } else {
            console.warn(`Directions request failed for route ${routeName}: ${status}`);
            
            // Fallback to regular route calculation
            this.calculateRoadRouteForPath(path, routeName)
              .then(() => {
                // Update route-specific sequence numbers
                this.updateRouteSpecificSequence(routeName);
                resolve();
              })
              .catch(reject);
          }
        });
      } catch (error) {
        console.error(`Error calculating optimal route for ${routeName}:`, error);
        // Fallback to regular route calculation
        this.calculateRoadRouteForPath(path, routeName)
          .then(() => {
            // Update route-specific sequence numbers
            this.updateRouteSpecificSequence(routeName);
            resolve();
          })
          .catch(reject);
      }
    });
  }
  
  /**
   * Update sequence numbers for a specific route
   */
  private updateRouteSpecificSequence(routeName: string): void {
    // Get all stores for this route
    const routeStores = this.storeLocations.filter(store => store.route === routeName);
    
    if (routeStores.length === 0) return;
    
    // Find the indices of these stores in the optimized route
    const optimizedIndices = this.optimizedRoute
      .map((idx, order) => ({ idx, order }))
      .filter(item => {
        if (item.idx >= 0 && item.idx < this.storeLocations.length) {
          return this.storeLocations[item.idx].route === routeName;
        }
        return false;
      })
      .sort((a, b) => a.order - b.order);
    
    // Update the display order for each store in this route
    optimizedIndices.forEach((item, index) => {
      if (item.idx >= 0 && item.idx < this.storeLocations.length) {
        this.storeLocations[item.idx].displayOrder = index + 1;
      }
    });
    
    // Force marker refresh to update labels
    setTimeout(() => {
      this.markers = [...this.markers];
    }, 50);
  }
  
  /**
   * Find the best (shortest) route from a directions result with alternatives
   */
  findBestRoute(response: google.maps.DirectionsResult): google.maps.DirectionsRoute {
    if (!response.routes || response.routes.length === 0) {
      throw new Error('No routes found in directions response');
    }
    
    // If we only have one route, return it
    if (response.routes.length === 1) {
      return response.routes[0];
    }
    
    // Find the shortest route
    let shortestRoute = response.routes[0];
    let shortestDistance = this.calculateRouteDistance(shortestRoute);
    
    for (let i = 1; i < response.routes.length; i++) {
      const route = response.routes[i];
      const distance = this.calculateRouteDistance(route);
      
      if (distance < shortestDistance) {
        shortestDistance = distance;
        shortestRoute = route;
      }
    }
    
    console.log(`Selected best route with distance: ${shortestDistance} meters`);
    return shortestRoute;
  }
  
  /**
   * Calculate total distance of a route
   */
  calculateRouteDistance(route: google.maps.DirectionsRoute): number {
    let distance = 0;
    
    if (route.legs) {
      route.legs.forEach(leg => {
        if (leg.distance) {
          distance += leg.distance.value;
        }
      });
    }
    
    return distance;
  }
  
  // Get visible routes for the map
  getVisibleRoutePolylines(): Map<string, { path: google.maps.LatLngLiteral[], options: any }> {
    // If not using multiple routes or no routes are selected
    if (!this.showMultipleRoutePolylines || this.selectedRoutes.size === 0) {
      return new Map();
    }
    
    // Return only the polylines for selected routes with paths visible
    const visiblePolylines = new Map<string, { path: google.maps.LatLngLiteral[], options: any }>();
    
    // Only include routes that are in the selectedRoutes set AND have showPath enabled
    this.routePolylines.forEach((value, key) => {
      const settings = this.routeSettings.get(key);
      if (this.selectedRoutes.has(key) && settings && settings.showPath) {
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

  // Initialize or update route marker icons with sequence numbers
  initializeRouteMarkerIcons(): void {
    this.routeMarkerIcons.clear();
    
    this.availableRoutes.forEach((route, index) => {
      if (route !== 'All Routes') {
        // Use modulo to cycle through colors
        const colorIndex = (index - 1) % this.routeColors.length;
        const routeColor = this.routeColors[colorIndex];
        this.routeColorMap.set(route, routeColor);
        
        // Create marker icon for this route
        this.routeMarkerIcons.set(route, {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: routeColor,
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#ffffff',
          scale: 14
        });
      }
    });
  }

  // Select all routes except "All Routes"
  selectAllRoutes(): void {
    this.selectedRoutes.clear();
    this.availableRoutes.forEach(route => {
      if (route !== 'All Routes') {
        this.selectedRoutes.add(route);
      }
    });
    this.updateVisibleRoutes();
  }

  // Clear all selected routes
  clearRouteSelection(): void {
    this.selectedRoutes.clear();
    this.updateVisibleRoutes();
  }

  // Apply the selected routes
  applySelectedRoutes(): void {
    if (this.selectedRoutes.size === 0) {
      return;
    }
    
    // Enable multiple route display mode
    this.showMultipleRoutePolylines = true;
    
    // Create route polylines for all selected routes
    this.createMultiRoutePolylines();
    
    // Update markers with the appropriate labels
    this.updateMarkerInfo();
    
    // Recalculate directions for selected routes
    this.recalculateSelectedRoutesDirections();
    
    // Force re-render of markers to update the labels
    setTimeout(() => {
      this.markers = [...this.markers];
    }, 50);
  }

  // Get route path visibility
  getRoutePathVisibility(route: string): boolean {
    const settings = this.routeSettings.get(route);
    return settings ? settings.showPath : false;
  }
  
  // Toggle route path visibility
  toggleRoutePathVisibility(route: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const settings = this.routeSettings.get(route);
    
    if (settings) {
      settings.showPath = checkbox.checked;
      this.routeSettings.set(route, settings);
      this.applySelectedRoutes();
    }
  }
  
  // Get route points visibility
  getRoutePointsVisibility(route: string): boolean {
    const settings = this.routeSettings.get(route);
    return settings ? settings.showPoints : false;
  }
  
  // Toggle route points visibility
  toggleRoutePointsVisibility(route: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const settings = this.routeSettings.get(route);
    
    if (settings) {
      settings.showPoints = checkbox.checked;
      this.routeSettings.set(route, settings);
      this.applySelectedRoutes();
    }
  }

  // Get a list of unique routes from store locations
  getUniqueRoutes(): string[] {
    if (!this.storeLocations.length) return [];
    
    // Get unique routes from store locations
    const uniqueRoutes = Array.from(new Set(this.storeLocations.map(store => store.route)))
      .filter(Boolean) // Filter out undefined/null/empty routes
      .sort(); // Sort alphabetically
      
    return uniqueRoutes;
  }
  
  // Toggle expanded state of a route
  toggleRouteExpanded(route: string): void {
    if (this.isRouteExpanded(route)) {
      this.expandedRoutes.delete(route);
    } else {
      this.expandedRoutes.add(route);
    }
  }
  
  // Check if a route is expanded
  isRouteExpanded(route: string): boolean {
    return this.expandedRoutes.has(route);
  }
  
  // Get number of locations for a specific route
  getLocationCountForRoute(route: string): number {
    return this.storeLocations.filter(store => store.route === route).length;
  }
  
  // Get all store locations for a specific route
  getStoresForRoute(route: string): StoreLocation[] {
    // Filter stores for this route
    const routeStores = this.storeLocations.filter(store => store.route === route);
    
    // If route is optimized, ensure stores are sorted by delivery sequence
    if (this.optimizedRoute.length > 0) {
      return routeStores.sort((a, b) => {
        // For optimized routes, always use displayOrder (route-specific sequence)
        // Fallback to routeOrder if displayOrder not available
        const aOrder = a.displayOrder !== undefined ? a.displayOrder : (a.routeOrder || 9999);
        const bOrder = b.displayOrder !== undefined ? b.displayOrder : (b.routeOrder || 9999);
        return aOrder - bOrder;
      });
    }
    
    // If route isn't optimized, return in original order
    return routeStores;
  }

  // Handle map clicks
  mapClick(event: google.maps.MapMouseEvent): void {
    // Do nothing by default - this is just a placeholder to satisfy the event binding
    console.log('Map clicked:', event);
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

  // Toggle the geocoding tool expansion
  toggleGeocodingTool(): void {
    this.geocodingToolExpanded = !this.geocodingToolExpanded;
  }

  // Batch geocode multiple addresses
  batchGeocodeAddresses(): void {
    if (!this.batchGeocodingInput || !this.apiLoaded) {
      return;
    }

    this.isGeocoding = true;
    this.errorMessage = '';

    // Split input by newlines to get individual addresses
    const addresses = this.batchGeocodingInput.split('\n')
      .map(addr => addr.trim())
      .filter(addr => addr.length > 0);

    if (addresses.length === 0) {
      this.isGeocoding = false;
      this.errorMessage = 'No valid addresses found.';
      return;
    }

    const geocoder = new google.maps.Geocoder();
    let completedRequests = 0;
    const totalRequests = addresses.length;
    const batchSize = 5; // Process in smaller batches to avoid exceeding rate limits
    let currentBatch = 0;
    
    const results: GeocodedAddress[] = [];

    const processBatch = () => {
      const startIdx = currentBatch * batchSize;
      const endIdx = Math.min(startIdx + batchSize, addresses.length);
      
      // Process each address in the batch
      for (let i = startIdx; i < endIdx; i++) {
        const address = addresses[i];
        
        if (!address) {
          completedRequests++;
          checkCompletion();
          continue;
        }
        
        try {
          geocoder.geocode({ address: address }, (geocodeResults, status) => {
            this.ngZone.run(() => {
              completedRequests++;
              
              if (status === google.maps.GeocoderStatus.OK && geocodeResults && geocodeResults[0]) {
                const location = geocodeResults[0].geometry.location;
                
                results.push({
                  query: address,
                  lat: location.lat(),
                  lng: location.lng(),
                  hasMarker: false
                });
              } else {
                console.warn(`Geocoding failed for ${address}: ${status}`);
                this.errorMessage = `Geocoding failed for some addresses. Check console for details.`;
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
      // When all requests are complete, update the UI
      if (completedRequests === totalRequests) {
        this.isGeocoding = false;
        this.geocodedAddresses = results;
        
        // Update map center if we have results
        if (results.length > 0) {
          this.center = {
            lat: results[0].lat,
            lng: results[0].lng
          };
          this.zoom = 14; // Zoom in to see the result better
        }
      }
    };
    
    // Start processing the first batch
    processBatch();
  }

  // Clear geocoding results
  clearGeocodingResults(): void {
    // Remove all markers associated with geocoded addresses
    this.geocodingMarkers.forEach(markerInfo => {
      const index = this.markers.findIndex(m => 
        m.position.lat === markerInfo.marker.position.lat && 
        m.position.lng === markerInfo.marker.position.lng
      );
      
      if (index !== -1) {
        this.markers.splice(index, 1);
      }
    });
    
    this.geocodingMarkers = [];
    this.geocodedAddresses = [];
    this.batchGeocodingInput = '';
  }

  // Zoom to a specific location
  zoomToLocation(address: GeocodedAddress): void {
    this.center = {
      lat: address.lat,
      lng: address.lng
    };
    this.zoom = 18; // Zoom in closely
    
    // Add marker if one doesn't exist
    if (!address.hasMarker) {
      this.toggleStoreMarker(address);
    }
  }

  // Toggle marker for a geocoded address
  toggleStoreMarker(address: GeocodedAddress): void {
    if (address.hasMarker) {
      // Remove marker
      const markerInfo = this.geocodingMarkers.find(m => m.id === address.markerId);
      if (markerInfo) {
        const index = this.markers.findIndex(m => 
          m.position.lat === markerInfo.marker.position.lat && 
          m.position.lng === markerInfo.marker.position.lng
        );
        
        if (index !== -1) {
          this.markers.splice(index, 1);
        }
        
        // Remove from geocoding markers
        const geoMarkerIndex = this.geocodingMarkers.findIndex(m => m.id === address.markerId);
        if (geoMarkerIndex !== -1) {
          this.geocodingMarkers.splice(geoMarkerIndex, 1);
        }
      }
      
      // Update address
      address.hasMarker = false;
      address.markerId = undefined;
    } else {
      // Add marker
      const markerId = this.nextGeocodingMarkerId++;
      const marker = {
        position: { lat: address.lat, lng: address.lng },
        info: `<div class="info-window-content">
                <h3>Geocoded Location</h3>
                <p><strong>Address:</strong> ${address.query}</p>
                <p><strong>Coordinates:</strong> ${address.lat.toFixed(6)}, ${address.lng.toFixed(6)}</p>
              </div>`,
        options: {
          draggable: true,
          animation: null,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#e53e3e',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 8
          }
        },
        addressRef: address // Reference to the address object
      };
      
      this.markers.push(marker);
      this.geocodingMarkers.push({ id: markerId, marker });
      
      // Update address
      address.hasMarker = true;
      address.markerId = markerId;
      
      // Update map center
      this.center = { lat: address.lat, lng: address.lng };
    }
  }

  // Export geocoded addresses to CSV
  exportGeocodedAddresses(): void {
    if (this.geocodedAddresses.length === 0) {
      return;
    }
    
    // Create CSV content
    let csvContent = "Address/Eircode,Latitude,Longitude\n";
    
    this.geocodedAddresses.forEach(address => {
      // Escape commas in the address
      const escapedAddress = address.query.includes(',') ? `"${address.query}"` : address.query;
      csvContent += `${escapedAddress},${address.lat},${address.lng}\n`;
    });
    
    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'geocoded_addresses.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Copy coordinates to clipboard
  copyCoordinates(address: GeocodedAddress): void {
    if (!address) return;
    
    // Format coordinates as latitude,longitude
    const coordsText = `${address.lat.toFixed(6)},${address.lng.toFixed(6)}`;
    
    // Copy to clipboard
    const textArea = document.createElement('textarea');
    textArea.value = coordsText;
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        // Show a temporary success message
        this.showCopySuccessMessage('Coordinates copied to clipboard!');
      } else {
        console.error('Copy command was unsuccessful');
      }
    } catch (err) {
      console.error('Could not copy text: ', err);
    }
    
    document.body.removeChild(textArea);
  }
  
  // Show a temporary success message
  private showCopySuccessMessage(message: string): void {
    const prevErrorMessage = this.errorMessage;
    this.errorMessage = message;
    
    // After 2 seconds, restore the previous error message
    setTimeout(() => {
      this.errorMessage = prevErrorMessage;
    }, 2000);
  }
  
  // Handle marker drag end event
  onMarkerDragEnd(marker: MapMarker, markerData: any): void {
    if (!marker || !markerData) return;
    
    // Get the new position
    const position = marker.getPosition();
    if (!position) return;
    
    const newPosition = {
      lat: position.lat(),
      lng: position.lng()
    };
    
    // Update the marker position in our data structure
    markerData.position = newPosition;
    
    // If this is a geocoded address marker, update the address coordinates
    if (markerData.addressRef) {
      markerData.addressRef.lat = newPosition.lat;
      markerData.addressRef.lng = newPosition.lng;
      
      // Update the info window content with new coordinates
      markerData.info = `<div class="info-window-content">
        <h3>Geocoded Location</h3>
        <p><strong>Address:</strong> ${markerData.addressRef.query}</p>
        <p><strong>Coordinates:</strong> ${newPosition.lat.toFixed(6)}, ${newPosition.lng.toFixed(6)}</p>
      </div>`;
    }
  }
} 