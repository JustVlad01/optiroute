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
    zoomControl: true,
    scrollwheel: true,
    disableDoubleClickZoom: false,
    maxZoom: 18,
    minZoom: 5,
    // Performance optimizations
    gestureHandling: 'cooperative',
    clickableIcons: false,
    disableDefaultUI: false,
    mapId: '' // Use a custom map ID for vectored maps if you have one
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
    // Example: London to Manchester with stops
    this.startLocation = 'London, UK';
    this.endLocation = 'Manchester, UK';
    this.stops = ['Birmingham, UK', 'Oxford, UK'];
  }
}
