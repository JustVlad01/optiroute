import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, forkJoin } from 'rxjs';
import { map, mergeMap, reduce } from 'rxjs/operators';

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface DistanceMatrixResponse {
  originAddresses: string[];
  destinationAddresses: string[];
  rows: {
    elements: {
      status: string;
      duration: { value: number; text: string };
      distance: { value: number; text: string };
    }[];
  }[];
}

export interface DistanceMatrixResult {
  origins: LatLngLiteral[];
  destinations: LatLngLiteral[];
  distances: number[][];
  durations: number[][];
  status: string;
}

// Interface definitions for Directions API response
interface DirectionsResponse {
  status: string;
  routes: DirectionsRoute[];
}

interface DirectionsRoute {
  legs: DirectionsLeg[];
  overview_polyline: { points: string };
}

interface DirectionsLeg {
  steps: DirectionsStep[];
  distance: { value: number; text: string };
  duration: { value: number; text: string };
}

interface DirectionsStep {
  polyline: { points: string };
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  path?: google.maps.LatLng[];
}

interface DirectionsWaypoint {
  location: google.maps.LatLng;
  stopover: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MapsApiService {
  // Constants for Google Maps API limits
  readonly MAX_WAYPOINTS_PER_REQUEST = 23;
  readonly MAX_ELEMENTS_PER_DISTANCE_MATRIX = 100; // 10x10 grid

  constructor(private http: HttpClient) { }

  /**
   * Build a complete distance matrix for a large number of locations
   * Handles chunking to stay within API limits
   */
  buildFullDistanceMatrix(
    locations: LatLngLiteral[],
    apiKey: string
  ): Observable<number[][]> {
    if (locations.length <= 1) {
      throw new Error('At least two locations are needed to create a distance matrix');
    }

    // Initialize empty matrix of appropriate size
    const distanceMatrix: number[][] = Array(locations.length)
      .fill(0)
      .map(() => Array(locations.length).fill(0));

    // Create chunks of locations to stay within API limits
    const chunkSize = Math.floor(Math.sqrt(this.MAX_ELEMENTS_PER_DISTANCE_MATRIX));
    const chunks: LatLngLiteral[][] = [];

    for (let i = 0; i < locations.length; i += chunkSize) {
      chunks.push(locations.slice(i, i + chunkSize));
    }

    // Generate all origin-destination pairs for chunks
    const chunkPairs: { origins: LatLngLiteral[], destinations: LatLngLiteral[] }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      for (let j = 0; j < chunks.length; j++) {
        chunkPairs.push({
          origins: chunks[i],
          destinations: chunks[j]
        });
      }
    }

    // Create observables for each chunk pair
    const matrixRequests = chunkPairs.map(pair => 
      this.getDistanceMatrix(pair.origins, pair.destinations, apiKey)
    );

    // Combine all results into a complete matrix
    return forkJoin(matrixRequests).pipe(
      map(results => {
        // Process each chunk result
        results.forEach(result => {
          // For each origin-destination pair in this chunk
          for (let i = 0; i < result.origins.length; i++) {
            for (let j = 0; j < result.destinations.length; j++) {
              // Find the indices of this origin and destination in the original locations array
              const originIndex = this.findLocationIndex(locations, result.origins[i]);
              const destIndex = this.findLocationIndex(locations, result.destinations[j]);
              
              if (originIndex !== -1 && destIndex !== -1) {
                // Store duration in matrix (prioritize duration over distance for optimization)
                distanceMatrix[originIndex][destIndex] = result.durations[i][j];
              }
            }
          }
        });
        
        return distanceMatrix;
      })
    );
  }

  /**
   * Get distance matrix for a chunk of origins and destinations
   */
  private getDistanceMatrix(
    origins: LatLngLiteral[],
    destinations: LatLngLiteral[],
    apiKey: string
  ): Observable<DistanceMatrixResult> {
    // Build URL for the Distance Matrix API request
    const baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';
    
    const params = {
      origins: origins.map(loc => `${loc.lat},${loc.lng}`).join('|'),
      destinations: destinations.map(loc => `${loc.lat},${loc.lng}`).join('|'),
      mode: 'driving',
      units: 'metric',
      key: apiKey
    };

    // Convert params object to URL parameters
    const queryParams = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    return this.http.get<DistanceMatrixResponse>(`${baseUrl}?${queryParams}`).pipe(
      map(response => {
        // Transform API response to our simplified format
        const result: DistanceMatrixResult = {
          origins: origins,
          destinations: destinations,
          distances: [],
          durations: [],
          status: 'OK'
        };

        response.rows.forEach(row => {
          const distanceRow: number[] = [];
          const durationRow: number[] = [];
          
          row.elements.forEach(element => {
            if (element.status === 'OK') {
              distanceRow.push(element.distance.value / 1000); // Convert to km
              durationRow.push(element.duration.value / 60); // Convert to minutes
            } else {
              // If not OK, use a large value to discourage using this path
              distanceRow.push(9999);
              durationRow.push(9999);
              result.status = element.status;
            }
          });
          
          result.distances.push(distanceRow);
          result.durations.push(durationRow);
        });
        
        return result;
      })
    );
  }

  /**
   * Find the index of a location in an array of locations
   */
  private findLocationIndex(locations: LatLngLiteral[], location: LatLngLiteral): number {
    return locations.findIndex(loc => 
      Math.abs(loc.lat - location.lat) < 1e-6 && 
      Math.abs(loc.lng - location.lng) < 1e-6
    );
  }

  /**
   * Calculate directions for a route with many stops by chunking into multiple requests
   */
  getChunkedDirections(
    allPoints: LatLngLiteral[],
    apiKey: string
  ): Observable<google.maps.LatLngLiteral[]> {
    if (allPoints.length <= 1) {
      throw new Error('At least two points required for directions');
    }

    // If we have fewer points than the API limit, do a single request
    if (allPoints.length <= this.MAX_WAYPOINTS_PER_REQUEST + 2) {
      return this.getDirections(
        allPoints[0],
        allPoints[allPoints.length - 1],
        allPoints.slice(1, allPoints.length - 1),
        apiKey
      );
    }

    // Otherwise, split into chunks
    // Each chunk shares its last point with the next chunk's first point
    const chunks: LatLngLiteral[][] = [];
    const chunkSize = this.MAX_WAYPOINTS_PER_REQUEST + 1;
    
    for (let i = 0; i < allPoints.length; i += chunkSize - 1) {
      chunks.push(allPoints.slice(i, Math.min(i + chunkSize, allPoints.length)));
    }

    // Process each chunk and combine the results
    return from(chunks).pipe(
      mergeMap((chunk, index) => {
        if (chunk.length < 2) {
          return []; // Skip invalid chunks
        }
        
        return this.getDirections(
          chunk[0],
          chunk[chunk.length - 1],
          chunk.slice(1, chunk.length - 1),
          apiKey
        );
      }, 1), // Process chunks sequentially with concurrency of 1
      reduce((acc: google.maps.LatLngLiteral[], points: google.maps.LatLngLiteral[]) => {
        // Combine all path points, avoiding duplicates at chunk boundaries
        if (acc.length === 0) {
          return points;
        }
        
        // Skip the first point of subsequent chunks (duplicate connection point)
        return [...acc, ...points];
      }, [])
    );
  }

  /**
   * Get directions for a single request (origin, destination, and waypoints)
   */
  private getDirections(
    origin: LatLngLiteral,
    destination: LatLngLiteral,
    waypoints: LatLngLiteral[],
    apiKey: string
  ): Observable<google.maps.LatLngLiteral[]> {
    // Build URL for the Directions API request
    const baseUrl = 'https://maps.googleapis.com/maps/api/directions/json';
    
    const waypointsStr = waypoints
      .map(point => `${point.lat},${point.lng}`)
      .join('|');
    
    const params = {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      waypoints: waypointsStr ? `via:${waypointsStr}` : '',
      optimize: 'false', // We're already optimizing before this
      mode: 'driving',
      key: apiKey
    };

    // Convert params object to URL parameters
    const queryParams = Object.entries(params)
      .filter(([_, value]) => value !== '') // Remove empty params
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    return this.http.get<DirectionsResponse>(`${baseUrl}?${queryParams}`).pipe(
      map(response => {
        if (response.status !== 'OK' || !response.routes || response.routes.length === 0) {
          throw new Error(`Directions request failed: ${response.status}`);
        }

        const route = response.routes[0];
        const pathPoints: google.maps.LatLngLiteral[] = [];
        
        // Extract polyline points for each leg
        if (route.legs) {
          route.legs.forEach((leg: DirectionsLeg) => {
            if (leg.steps) {
              leg.steps.forEach((step: DirectionsStep) => {
                if (step.polyline && step.polyline.points) {
                  // Decode polyline points and add to path
                  const points = this.decodePolyline(step.polyline.points);
                  pathPoints.push(...points);
                }
              });
            }
          });
        }
        
        return pathPoints;
      })
    );
  }

  /**
   * Decode a Google encoded polyline string
   */
  private decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
    const points: google.maps.LatLngLiteral[] = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push({
        lat: lat / 1e5,
        lng: lng / 1e5
      });
    }

    return points;
  }
} 