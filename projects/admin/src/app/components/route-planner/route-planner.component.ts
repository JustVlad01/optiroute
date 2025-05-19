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
  markerOptions: google.maps.MarkerOptions = { 
    draggable: false,
    animation: google.maps.Animation.DROP
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

  // Starting point properties
  startingPointAddress = '';
  startingPointMarker: {
    position: google.maps.LatLngLiteral;
    options: google.maps.MarkerOptions;
  } | null = null;

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
    animation: google.maps.Animation.DROP
  };
  highlightedMarkerOptions: google.maps.MarkerOptions = { 
    draggable: false,
    animation: null,
    zIndex: 1000,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#f6ad55',
      fillOpacity: 1,
      strokeWeight: 2,
      strokeColor: '#ffffff',
      scale: 12
    }
  };

  // Properties for address editing
  editingStoreIndex: number | null = null;
  editedAddress: string = '';
  editedEircode: string = '';

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
    
    return processedData;
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

    this.storeLocations.forEach((store, index) => {
      // Combine address and eircode for more accurate results
      const addressQuery = `${store.address || ''} ${store.eircode || ''}`.trim();
      
      if (!addressQuery) {
        completedRequests++;
        if (completedRequests === totalRequests) {
          this.isLoading = false;
          this.updateMap();
        }
        return;
      }

      // Add a small delay between requests to avoid rate limiting
      setTimeout(() => {
        try {
          geocoder.geocode({ address: addressQuery }, (results, status) => {
            this.ngZone.run(() => {
              completedRequests++;
              
              if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                const location = results[0].geometry.location;
                this.storeLocations[index].lat = location.lat();
                this.storeLocations[index].lng = location.lng();
                
                // Add marker
                this.markers.push({
                  position: { lat: location.lat(), lng: location.lng() },
                  info: `<div class="info-window-content">
                          <h3>${store.storeName}</h3>
                          <p><strong>Quantity:</strong> ${store.quantity}</p>
                          <p><strong>Route:</strong> ${store.route}</p>
                          <p><strong>Address:</strong> ${store.address}</p>
                          <p><strong>Eircode:</strong> ${store.eircode}</p>
                          <p><strong>Opening Time:</strong> ${store.openingTime}</p>
                          ${store.eta ? `<p><strong>ETA:</strong> ${store.eta}</p>` : ''}
                        </div>`
                });
              } else {
                console.warn(`Geocoding failed for ${addressQuery}: ${status}`);
              }
              
              // When all requests are complete, update the map
              if (completedRequests === totalRequests) {
                this.isLoading = false;
                this.updateMap();
                // Add this line to initialize missing locations UI
                this.processGeocodingResults();
              }
            });
          });
        } catch (error) {
          console.error('Geocoding error:', error);
          this.ngZone.run(() => {
            completedRequests++;
            if (completedRequests === totalRequests) {
              this.isLoading = false;
              this.updateMap();
              // Add this line to initialize missing locations UI
              this.processGeocodingResults();
            }
          });
        }
      }, index * 200); // 200ms delay between requests
    });
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
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: '#4CAF50', // Green
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: '#ffffff',
                  scale: 12
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

  getMarkerOptions(index: number): google.maps.MarkerOptions {
    // If this is the highlighted marker, return highlighted options
    if (index === this.highlightedMarkerIndex) {
      return this.highlightedMarkerOptions;
    }
    
    // Otherwise return normal options
    return this.normalMarkerOptions;
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
      
      // Get the road-based route using the Directions API (chunked if needed)
      if (this.googleMapsApiKey && orderedPoints.length > 1) {
        // Use HTTP API
        this.mapsApiService.getChunkedDirections(orderedPoints, this.googleMapsApiKey)
          .subscribe(
            pathPoints => {
              // Set path coordinates
              this.pathCoordinates = pathPoints;
              
              // Calculate ETAs
              this.calculateETAs();
              
              // Update marker info windows with ETAs
              this.updateMarkerInfo();
              
              this.isLoading = false;
              this.isOptimizing = false;
            },
            error => {
              console.error('Error getting directions:', error);
              
              // Fallback to straight lines
              this.pathCoordinates = orderedPoints;
              
              // Calculate ETAs
              this.calculateETAs();
              
              // Update marker info windows with ETAs
              this.updateMarkerInfo();
              
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
          
          this.isLoading = false;
          this.isOptimizing = false;
        }).catch(error => {
          console.error('Error calculating road route:', error);
          
          // Fallback to straight lines
          this.pathCoordinates = orderedPoints;
          
          // Calculate ETAs
          this.calculateETAs();
          
          // Update marker info windows with ETAs
          this.updateMarkerInfo();
          
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
   * Calculate road route using Directions API with chunking for large routes
   * This handles the 23 waypoint limit by splitting the route into multiple requests
   */
  calculateChunkedRoadRoute(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.directionsService || this.optimizedRoute.length < 1) {
        reject(new Error('Directions service not available or no route to calculate'));
        return;
      }
      
      // Clear existing path coordinates
      this.pathCoordinates = [];
      
      // Create array of all point locations in order
      const routePoints: google.maps.LatLngLiteral[] = [];
      
      // Add starting point if it exists
      if (this.startingPointMarker) {
        routePoints.push(this.startingPointMarker.position);
      }
      
      // Add all points in the optimized route
      this.optimizedRoute.forEach(idx => {
        if (idx >= 0 && idx < this.markers.length) {
          routePoints.push(this.markers[idx].position);
        }
      });
      
      if (routePoints.length <= 1) {
        reject(new Error('Not enough points to calculate a route'));
        return;
      }
      
      // If we have fewer waypoints than the limit, use a single request
      if (routePoints.length <= this.MAX_WAYPOINTS_PER_REQUEST + 2) {
        // Single request (origin + up to 23 waypoints + destination)
        this.calculateRoadRoute().then(resolve).catch(reject);
        return;
      }
      
      // Otherwise, split into chunks
      console.log(`Route has ${routePoints.length} points, splitting into chunks`);
      
      // Create chunks of MAX_WAYPOINTS_PER_REQUEST+1 points
      // Each chunk shares its last point with the next chunk's first point
      const chunks: google.maps.LatLngLiteral[][] = [];
      const chunkSize = this.MAX_WAYPOINTS_PER_REQUEST + 1;
      
      for (let i = 0; i < routePoints.length; i += chunkSize - 1) {
        chunks.push(routePoints.slice(i, i + chunkSize));
      }
      
      console.log(`Split into ${chunks.length} chunks`);
      
      // Process each chunk sequentially
      this.processChunkedRoutes(chunks, 0).then(resolve).catch(reject);
    });
  }
  
  /**
   * Process route chunks recursively
   */
  processChunkedRoutes(chunks: google.maps.LatLngLiteral[][], chunkIndex: number): Promise<void> {
    return new Promise((resolve, reject) => {
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

  calculateETAs(): void {
    if (this.optimizedRoute.length === 0 || !this.startTime) {
      return;
    }
    
    // Parse the starting time
    const [startHours, startMinutes] = this.startTime.split(':').map(Number);
    let currentTime = new Date();
    currentTime.setHours(startHours, startMinutes, 0, 0);
    
    let prevPosition: google.maps.LatLngLiteral;
    
    // If we have a custom starting point
    if (this.startingPointMarker) {
      prevPosition = this.startingPointMarker.position;
    } else if (this.optimizedRoute.length > 0) {
      // If starting from the first location in optimized route
      const firstIdx = this.optimizedRoute[0];
      prevPosition = this.markers[firstIdx].position;
      
      // Add ETA for first location (same as start time)
      this.storeLocations[firstIdx].eta = this.formatTime(currentTime);
      
      // Add stop time for first location
      currentTime = new Date(currentTime.getTime() + this.averageStopTimeMinutes * 60000);
    } else {
      return;
    }
    
    // Calculate ETA for each location in the optimized route
    for (let i = this.startingPointMarker ? 0 : 1; i < this.optimizedRoute.length; i++) {
      const idx = this.optimizedRoute[i];
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
  }

  updateMarkerInfo(): void {
    // Update marker info windows with new ETAs
    this.optimizedRoute.forEach(idx => {
      const store = this.storeLocations[idx];
      if (store.eta && idx < this.markers.length) {
        const orderText = store.routeOrder ? `<p><strong>Stop #:</strong> ${store.routeOrder}</p>` : '';
        this.markers[idx].info = `<div class="info-window-content">
          <h3>${store.storeName}</h3>
          ${orderText}
          <p><strong>Quantity:</strong> ${store.quantity}</p>
          <p><strong>Route:</strong> ${store.route}</p>
          <p><strong>Address:</strong> ${store.address}</p>
          <p><strong>Eircode:</strong> ${store.eircode}</p>
          <p><strong>Opening Time:</strong> ${store.openingTime}</p>
          <p><strong>ETA:</strong> ${store.eta}</p>
        </div>`;
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

  // Function to get sorted store locations for display
  getSortedLocations(): StoreLocation[] {
    if (this.optimizedRoute.length === 0) {
      // If no optimization, show original order
      return this.storeLocations;
    }
    
    // Create a copy to sort
    return [...this.storeLocations].sort((a, b) => {
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
          if (idx < this.storeLocations.length) {
            this.storeLocations[idx].routeOrder = order + 1;
          }
        });
        
        // Calculate road-based route using Directions API
        this.calculateRoadRoute().then(() => {
          // Small delay to allow UI to update
          setTimeout(resolve, 100);
        }).catch(error => {
          console.error('Error calculating road route:', error);
          // Fallback to straight lines
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
    const route = response.routes[0];
    
    if (!route || !route.legs) {
      return;
    }
    
    // Extract each point of the route path
    route.legs.forEach(leg => {
      if (leg.steps) {
        leg.steps.forEach(step => {
          if (step.path) {
            // Convert LatLng objects to LatLngLiteral
            const points = step.path.map(point => ({ 
              lat: point.lat(), 
              lng: point.lng() 
            }));
            
            // Add to path coordinates
            this.pathCoordinates.push(...points);
          }
        });
      }
    });
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
  
  // Add a marker for a store
  addMarkerForStore(store: StoreLocation): void {
    if (!store.lat || !store.lng) return;
    
    // Check if marker already exists
    const existingMarkerIndex = this.markers.findIndex(marker => 
      Math.abs(marker.position.lat - store.lat!) < 1e-6 && 
      Math.abs(marker.position.lng - store.lng!) < 1e-6
    );
    
    // Create the info window content
    const infoContent = `<div class="info-window-content">
      <h3>${store.storeName}</h3>
      <p><strong>Quantity:</strong> ${store.quantity}</p>
      <p><strong>Route:</strong> ${store.route}</p>
      <p><strong>Address:</strong> ${store.address}</p>
      <p><strong>Eircode:</strong> ${store.eircode}</p>
      <p><strong>Opening Time:</strong> ${store.openingTime}</p>
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
} 