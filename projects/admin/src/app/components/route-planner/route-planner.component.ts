import { Component, OnInit, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsModule, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';

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
  
  // UI State
  showImport = false;
  
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
    gestureHandling: 'cooperative',
    clickableIcons: false,
    disableDefaultUI: false,
    mapId: ''
  };
  
  // Route data
  markers: any[] = [];
  directionsService: google.maps.DirectionsService | undefined;
  directionsRenderer: google.maps.DirectionsRenderer | undefined;
  map: google.maps.Map | undefined;
  
  constructor(private ngZone: NgZone, private route: ActivatedRoute) {}
  
  ngOnInit(): void {
    // Load Google Maps API
    if (!window.google || !window.google.maps) {
      // Create the script element
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.ngZone.run(() => {
          console.log('Google Maps API loaded');
          this.apiLoaded = true;
          this.initializeServices();
        });
      };
      document.head.appendChild(script);
    } else {
      this.apiLoaded = true;
      this.initializeServices();
    }
  }
  
  // Initialize Google Maps services
  private initializeServices(): void {
    // Create directions service
    this.directionsService = new google.maps.DirectionsService();
    
    // Create directions renderer
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: false,
      draggable: true,
      polylineOptions: {
        strokeWeight: 4,
        strokeOpacity: 0.7
      }
    });
  }
  
  // Map loaded event handler
  onMapInitialized(map: google.maps.Map): void {
    this.map = map;
    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(map);
    }
  }
  
  // Display info window when marker is clicked
  openInfoWindow(marker: any, content: string): void {
    if (this.infoWindow && this.map) {
      // Set info window content
      this.infoWindow.options = {
        content: content,
        maxWidth: 300,
        disableAutoPan: false,
      };
      
      // Open info window
      this.infoWindow.open(marker);
    }
  }
}
