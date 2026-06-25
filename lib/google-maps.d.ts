// Minimal type declarations for Google Maps JS API (browser-side)
// The full @types/google.maps package can be added later for richer types.

interface GoogleMapsLatLng {
  lat(): number
  lng(): number
}

interface GoogleMapsPlace {
  place_id?: string
  name?: string
  formatted_address?: string
  geometry?: {
    location: GoogleMapsLatLng
  }
}

interface GoogleMapsAutocomplete {
  addListener(event: string, handler: () => void): void
  getPlace(): GoogleMapsPlace
}

interface GoogleMapsPlacesLib {
  Autocomplete: new (
    input: HTMLInputElement,
    opts?: Record<string, unknown>
  ) => GoogleMapsAutocomplete
}

interface GoogleMapsLib {
  places: GoogleMapsPlacesLib
}

declare global {
  interface Window {
    google?: {
      maps: GoogleMapsLib
    }
  }
}

export {}
