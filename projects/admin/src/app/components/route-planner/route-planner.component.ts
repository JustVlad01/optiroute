import { Component, OnInit, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-route-planner',
  standalone: true,
  imports: [CommonModule, GoogleMapsModule, FormsModule, RouterModule],
  templateUrl: './route-planner.component.html',
  styleUrl: './route-planner.component.scss'
})
export class RoutePlannerComponent implements OnInit {
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  // Google Maps API Key
  apiKey = 'AIzaSyCnsVzHUKFmzMl62YcJh2xOhtjeS6Z5T-U';
  
  // Google Maps loading state
  apiLoaded = false;
  
  // Google Maps Configuration
  center: google.maps.LatLngLiteral = { lat: 51.5074, lng: -0.1278 }; // London as default
  zoom = 10;
  options: google.maps.MapOptions = {
    mapTypeId: 'roadmap',
    zoomControl: false,
    scrollwheel: true,
    disableDoubleClickZoom: false,
    maxZoom: 18,
    minZoom: 5,
    gestureHandling: 'cooperative',
    clickableIcons: false,
    disableDefaultUI: true,
    mapId: ''
  };
  
  // Route data
  markers: any[] = [];
  directionsService: google.maps.DirectionsService | undefined;
  directionsRenderer: google.maps.DirectionsRenderer | undefined;
  routeWaypoints: google.maps.DirectionsWaypoint[] = [];
  map: google.maps.Map | undefined;
  
  // Form data
  startLocation = '';
  endLocation = '';
  stops: string[] = [''];
  isLoading = false;
  
  // Route filtering and selection
  routeType: 'all' | 'old' | 'new' = 'all';
  savedRoutes: Array<{
    id: string;
    name: string;
    type: 'old' | 'new';
    startLocation: string;
    endLocation: string;
    stops: string[];
    routeData?: any;
    selected?: boolean;
  }> = [];
  
  // Display mode
  viewMode: 'filter' | 'selection' = 'selection';
  
  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    // Check if Google Maps API is already loaded
    if (window.google && window.google.maps) {
      this.initMap();
      this.apiLoaded = true;
    } else {
      // Listen for the custom event we dispatch when maps is loaded
      window.addEventListener('google-maps-loaded', () => {
        this.ngZone.run(() => {
          this.initMap();
          this.apiLoaded = true;
        });
      });
    }
    
    // Initialize with some example routes
    this.initSampleRoutes();
  }
  
  // Initialize map services after Google Maps is loaded
  private initMap(): void {
    // Initialize directions service and renderer
    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: false,
      draggable: true,
      // Performance optimizations
      preserveViewport: false,
      polylineOptions: {
        strokeWeight: 4,
        strokeOpacity: 0.7
      }
    });
    
    // Add some example locations
    this.addExampleLocations();
  }
  
  // Map loaded event handler
  onMapInitialized(map: google.maps.Map): void {
    this.map = map;
    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(map);
    }
  }
  
  // Add a new stop field
  addStop(): void {
    this.stops.push('');
  }
  
  // Remove a stop at specific index
  removeStop(index: number): void {
    this.stops.splice(index, 1);
  }
  
  // Clear the route
  clearRoute(): void {
    this.markers = [];
    this.stops = [''];
    this.startLocation = '';
    this.endLocation = '';
    
    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(null);
      this.directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        draggable: true,
        // Performance optimizations
        preserveViewport: false,
        polylineOptions: {
          strokeWeight: 4,
          strokeOpacity: 0.7
        }
      });
      
      if (this.map) {
        this.directionsRenderer.setMap(this.map);
      }
    }
  }
  
  // Calculate the route
  calculateRoute(): void {
    if (!this.startLocation || !this.endLocation) {
      alert('Please enter start and end locations');
      return;
    }
    
    this.isLoading = true;
    this.routeWaypoints = [];
    
    // Add waypoints from stops (filtering out empty stops)
    this.stops.forEach(stop => {
      if (stop.trim()) {
        this.routeWaypoints.push({
          location: stop,
          stopover: true
        });
      }
    });
    
    const request: google.maps.DirectionsRequest = {
      origin: this.startLocation,
      destination: this.endLocation,
      waypoints: this.routeWaypoints,
      optimizeWaypoints: true,
      travelMode: google.maps.TravelMode.DRIVING,
      // Performance optimizations
      provideRouteAlternatives: false,
      avoidFerries: false,
      avoidHighways: false,
      avoidTolls: false
    };
    
    // Request directions
    this.directionsService?.route(request, (response, status) => {
      this.ngZone.run(() => {
        this.isLoading = false;
        
        if (status === google.maps.DirectionsStatus.OK) {
          // Display the route
          if (this.directionsRenderer) {
            this.directionsRenderer.setDirections(response);
          }
          
          // Extract route information if needed
          const route = response?.routes[0];
          console.log('Route details:', route);
        } else {
          alert('Directions request failed due to ' + status);
        }
      });
    });
  }
  
  // Open info window for a marker
  openInfoWindow(marker: MapMarker, content: string): void {
    this.infoWindow.infoWindow?.setContent(content);
    this.infoWindow.open(marker);
  }
  
  // Add example locations for demonstration
  private addExampleLocations(): void {
    // No default locations
    this.startLocation = '';
    this.endLocation = '';
    this.stops = [''];
  }
  
  // Filter routes by type
  setRouteTypeFilter(type: 'all' | 'old' | 'new'): void {
    this.routeType = type;
    this.filterRoutes();
  }
  
  // Filter the routes based on selected type
  filterRoutes(): void {
    if (this.routeType === 'all') {
      // Show all routes or do nothing
      console.log('Showing all routes');
      return;
    }
    
    // Filter routes by type
    const filteredRoutes = this.savedRoutes.filter(route => route.type === this.routeType);
    console.log(`Showing ${this.routeType} routes:`, filteredRoutes);
    
    // Here you could load a specific route if needed
    if (filteredRoutes.length > 0) {
      // Example: load the first filtered route
      // this.loadRoute(filteredRoutes[0]);
    }
  }
  
  // Initialize sample routes for demonstration
  private initSampleRoutes(): void {
    this.savedRoutes = [];
  }
  
  // Load a saved route
  loadRoute(route: any): void {
    this.startLocation = route.startLocation;
    this.endLocation = route.endLocation;
    this.stops = [...route.stops];
    
    // Calculate the route after loading
    this.calculateRoute();
  }
  
  // Toggle selection of a route
  toggleRouteSelection(route: any, event: Event): void {
    event.stopPropagation(); // Prevent the click from triggering loadRoute
    route.selected = !route.selected;
  }
  
  // Check if any route is selected
  get hasSelectedRoutes(): boolean {
    return this.savedRoutes.some(route => route.selected);
  }
  
  // Get only selected routes
  get selectedRoutes(): any[] {
    return this.savedRoutes.filter(route => route.selected);
  }
  
  // Show only selected routes or all if none selected
  shouldShowRoute(route: any): boolean {
    // When in filter mode, use the routeType filter
    if (this.viewMode === 'filter') {
      return this.routeType === 'all' || route.type === this.routeType;
    }
    
    // When in selection mode, show all if none selected or only selected routes
    return !this.hasSelectedRoutes || route.selected;
  }
  
  // Switch between filter and selection view modes
  setViewMode(mode: 'filter' | 'selection'): void {
    this.viewMode = mode;
    
    // Reset selections when switching to filter mode
    if (mode === 'filter') {
      this.savedRoutes.forEach(route => route.selected = false);
    }
  }
}
