import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { RoutePlannerComponent } from './route-planner.component';
import { MapsApiService } from '../../services/maps-api.service';

// Mock the Google Maps API
declare global {
  interface Window {
    googleMapsLoaded?: boolean;
    google?: any;
  }
}

describe('RoutePlannerComponent', () => {
  let component: RoutePlannerComponent;
  let fixture: ComponentFixture<RoutePlannerComponent>;
  let mockMapsApiService: jasmine.SpyObj<MapsApiService>;

  beforeEach(async () => {
    // Set up mocks for Google Maps API
    window.google = {
      maps: {
        Geocoder: class {
          geocode(request: any, callback: any) {
            callback([{
              geometry: {
                location: {
                  lat: () => 53.349805,
                  lng: () => -6.260310
                }
              }
            }], 'OK');
          }
        },
        DirectionsService: class {
          route(request: any, callback: any) {
            callback({
              routes: [{
                legs: [{
                  distance: { value: 1000 },
                  steps: [{
                    path: [{ lat: 53.349805, lng: -6.260310 }]
                  }]
                }]
              }]
            }, 'OK');
          }
        },
        DirectionsStatus: {
          OK: 'OK'
        },
        GeocoderStatus: {
          OK: 'OK'
        },
        LatLng: class {
          constructor(lat: number, lng: number) {}
          lat() { return 53.349805; }
          lng() { return -6.260310; }
        },
        TravelMode: {
          DRIVING: 'DRIVING'
        },
        LatLngBounds: class {
          extend() {}
        },
        UnitSystem: {
          METRIC: 0
        },
        DistanceMatrixService: class {
          getDistanceMatrix(request: any, callback: any) {
            callback({
              rows: [{
                elements: [{
                  distance: { value: 1000 },
                  duration: { value: 600 }
                }]
              }]
            }, 'OK');
          }
        },
        DistanceMatrixStatus: {
          OK: 'OK'
        }
      }
    };
    
    window.googleMapsLoaded = true;
    
    mockMapsApiService = jasmine.createSpyObj('MapsApiService', ['getApiKey', 'setApiKey', 'calculateRoute', 'getDistanceMatrix']);
    mockMapsApiService.getApiKey.and.returnValue('test-api-key');
    
    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        GoogleMapsModule,
        RouterModule,
        RouterTestingModule
      ],
      providers: [
        { provide: MapsApiService, useValue: mockMapsApiService }
      ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RoutePlannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with Google Maps API', () => {
    expect(component.apiLoaded).toBeTrue();
  });

  // New tests for the geocoding functionality
  describe('Geocoding feature', () => {
    it('should toggle geocoding tool expansion', () => {
      component.geocodingToolExpanded = false;
      component.toggleGeocodingTool();
      expect(component.geocodingToolExpanded).toBeTrue();
      
      component.toggleGeocodingTool();
      expect(component.geocodingToolExpanded).toBeFalse();
    });
    
    it('should geocode addresses when batchGeocodeAddresses is called', () => {
      // Arrange
      component.batchGeocodingInput = 'Test Address 1\nTest Address 2';
      spyOn(google.maps, 'Geocoder').and.callThrough();
      
      // Act
      component.batchGeocodeAddresses();
      
      // Wait for async operations to complete
      fixture.detectChanges();
      
      // Assert
      expect(component.isGeocoding).toBeFalse();
      expect(component.geocodedAddresses.length).toBeGreaterThan(0);
    });
    
    it('should clear geocoding results', () => {
      // Arrange
      component.geocodedAddresses = [
        { query: 'Test Address', lat: 53.34, lng: -6.26, hasMarker: false }
      ];
      component.batchGeocodingInput = 'Test Address';
      
      // Act
      component.clearGeocodingResults();
      
      // Assert
      expect(component.geocodedAddresses.length).toBe(0);
      expect(component.batchGeocodingInput).toBe('');
    });
    
    it('should toggle marker for a geocoded address', () => {
      // Arrange
      const address = { query: 'Test Address', lat: 53.34, lng: -6.26, hasMarker: false };
      component.geocodedAddresses = [address];
      
      // Act - Add marker
      component.toggleStoreMarker(address);
      
      // Assert
      expect(address.hasMarker).toBeTrue();
      expect(address.markerId).toBeDefined();
      
      // Act - Remove marker
      component.toggleStoreMarker(address);
      
      // Assert
      expect(address.hasMarker).toBeFalse();
      expect(address.markerId).toBeUndefined();
    });
    
    it('should zoom to location', () => {
      // Arrange
      const address = { query: 'Test Address', lat: 53.34, lng: -6.26, hasMarker: false };
      
      // Act
      component.zoomToLocation(address);
      
      // Assert
      expect(component.center.lat).toBe(address.lat);
      expect(component.center.lng).toBe(address.lng);
      expect(component.zoom).toBe(18);
    });
  });
}); 