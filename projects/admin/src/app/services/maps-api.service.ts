import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MapsApiService {
  private apiKey = '';
  
  constructor() {}
  
  getApiKey(): string {
    return this.apiKey;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }
  
  calculateRoute(
    origin: google.maps.LatLngLiteral,
    destination: google.maps.LatLngLiteral,
    waypoints: google.maps.DirectionsWaypoint[] = []
  ): Promise<google.maps.DirectionsResult> {
    const directionsService = new google.maps.DirectionsService();
    return directionsService.route({
      origin,
      destination,
      waypoints,
      optimizeWaypoints: true,
      travelMode: google.maps.TravelMode.DRIVING
    });
  }
  
  getDistanceMatrix(
    origins: google.maps.LatLngLiteral[], 
    destinations: google.maps.LatLngLiteral[]
  ): Promise<google.maps.DistanceMatrixResponse> {
    const service = new google.maps.DistanceMatrixService();
    return service.getDistanceMatrix({
      origins,
      destinations,
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC
    });
  }
} 