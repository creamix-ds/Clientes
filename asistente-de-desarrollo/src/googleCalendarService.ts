import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { Appointment } from "./types";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Configure Google OAuth Provider
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/calendar");
provider.addScope("https://www.googleapis.com/auth/calendar.events");

// In-memory token storage
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize auth listener
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Since Firebase token persists but the provider OAuth access token might not be in cache,
        // we might need to re-login, but let's check if we can get it or if we show sign in.
        // We will reset cachedAccessToken to null and trigger failure so they can login.
        cachedAccessToken = null;
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Sign in with Google
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("No se pudo obtener el token de acceso de Google Calendar.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Error al iniciar sesión:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Logout
export const logoutUser = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Helper to determine the target Calendar ID (uses or creates a KinesioSpa calendar, or defaults to primary)
let targetCalendarId: string | null = null;

export const getOrCreateKinesioSpaCalendar = async (accessToken: string): Promise<string> => {
  if (targetCalendarId) return targetCalendarId;

  try {
    // 1. List calendars to see if "KinesioSpa" already exists
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("401_UNAUTHORIZED");
      }
      const errBody = await response.text();
      throw new Error(`Failed to list calendars (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    const existing = data.items?.find((cal: any) => cal.summary === "KinesioSpa");
    if (existing) {
      targetCalendarId = existing.id;
      return existing.id;
    }

    // 2. If not found, try to create a secondary calendar named "KinesioSpa"
    const createResponse = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: "KinesioSpa",
        description: "Gestor de turnos de Kinesiología, Fisioterapia & Spa",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    });

    if (createResponse.ok) {
      const newCal = await createResponse.json();
      targetCalendarId = newCal.id;
      return newCal.id;
    } else {
      if (createResponse.status === 401) {
        throw new Error("401_UNAUTHORIZED");
      }
    }
  } catch (err: any) {
    if (err.message === "401_UNAUTHORIZED") {
      throw new Error("La sesión de Google ha expirado (401). Por favor inicie sesión de nuevo.");
    }
    console.warn("Fallo al crear calendario dedicado, se utilizará el principal:", err);
  }

  // Fallback to primary calendar if secondary creation fails
  targetCalendarId = "primary";
  return "primary";
};

// Fetch appointments from Google Calendar
export const fetchAppointments = async (
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<Appointment[]> => {
  try {
    const calendarId = await getOrCreateKinesioSpaCalendar(accessToken);
    
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250"
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      let msg = response.statusText || `Estado ${response.status}`;
      try {
        const errJson = JSON.parse(errorBody);
        if (errJson?.error?.message) {
          msg = errJson.error.message;
        }
      } catch (e) {}
      throw new Error(`Error de Google Calendar API (${response.status}): ${msg}`);
    }

    const data = await response.json();
    const events = data.items || [];

    // Parse events into Appointment objects
    const appointments: Appointment[] = [];

    for (const event of events) {
      const summary = event.summary || "";
      const description = event.description || "";

      // We look for events that have [KinesioSpa] in the summary or description
      const isKinesioSpaEvent = 
        summary.startsWith("[KinesioSpa]") || 
        summary.includes("KinesioSpa") || 
        description.includes("💆 Servicio:") || 
        description.includes("KinesioSpa");

      if (!isKinesioSpaEvent) continue;

      // Extract details from description or summary
      // Summary format is usually "[KinesioSpa] Patient Name - Service"
      // Or we can parse the description:
      // "📞 Contacto: +549112233"
      // "💆 Servicio: Kinesiología"
      // "📝 Notas: ..."
      let patientName = summary.replace(/^\[KinesioSpa\]\s*/, "").split(" - ")[0] || "Paciente Sin Nombre";
      let serviceType: "Kinesiología" | "Fisioterapia" | "Spa" = "Kinesiología";
      let contactNumber = "";
      let notes = "";

      if (summary.includes(" - ")) {
        const parts = summary.split(" - ");
        const servicePart = parts[1]?.trim();
        if (servicePart === "Fisioterapia" || servicePart === "Spa" || servicePart === "Kinesiología") {
          serviceType = servicePart;
        }
      }

      // Parse from description for higher reliability
      const contactMatch = description.match(/📞\s*(?:Número de contacto|Contacto|Teléfono):\s*([^\n]+)/i);
      if (contactMatch) contactNumber = contactMatch[1].trim();

      const serviceMatch = description.match(/💆\s*Servicio:\s*([^\n]+)/i);
      if (serviceMatch) {
        const sValue = serviceMatch[1].trim();
        if (sValue === "Fisioterapia" || sValue === "Spa" || sValue === "Kinesiología") {
          serviceType = sValue as any;
        }
      }

      const notesMatch = description.match(/📝\s*Notas:\s*([\s\S]+)$/i);
      if (notesMatch) notes = notesMatch[1].trim();

      const start = event.start?.dateTime || event.start?.date || "";
      const end = event.end?.dateTime || event.end?.date || "";

      appointments.push({
        id: event.id,
        patientName,
        contactNumber: contactNumber || "No especificado",
        serviceType,
        start,
        end,
        notes: notes || undefined,
        htmlLink: event.htmlLink
      });
    }

    return appointments;
  } catch (error) {
    console.error("Error al obtener turnos de Google Calendar:", error);
    throw error;
  }
};

// Create an appointment in Google Calendar
export const createAppointmentInCalendar = async (
  accessToken: string,
  appointment: Omit<Appointment, "id">
): Promise<Appointment> => {
  try {
    const calendarId = await getOrCreateKinesioSpaCalendar(accessToken);

    const summary = `[KinesioSpa] ${appointment.patientName} - ${appointment.serviceType}`;
    const description = `💆 Servicio: ${appointment.serviceType}\n📞 Contacto: ${appointment.contactNumber}\n📝 Notas: ${appointment.notes || "Sin observaciones adicionales."}\n\nCreado vía Gestor de Turnos KinesioSpa.`;

    const body = {
      summary,
      description,
      start: {
        dateTime: appointment.start,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: appointment.end,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      reminders: {
        useDefault: true
      }
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      let msg = response.statusText || `Estado ${response.status}`;
      try {
        const errJson = JSON.parse(errBody);
        if (errJson?.error?.message) {
          msg = errJson.error.message;
        }
      } catch (e) {}
      throw new Error(`Fallo al crear evento en Google Calendar (${response.status}): ${msg}`);
    }

    const createdEvent = await response.json();
    return {
      id: createdEvent.id,
      patientName: appointment.patientName,
      contactNumber: appointment.contactNumber,
      serviceType: appointment.serviceType,
      start: createdEvent.start?.dateTime || appointment.start,
      end: createdEvent.end?.dateTime || appointment.end,
      notes: appointment.notes,
      htmlLink: createdEvent.htmlLink
    };
  } catch (error) {
    console.error("Error al crear turno en Google Calendar:", error);
    throw error;
  }
};

// Delete an appointment in Google Calendar
export const deleteAppointmentInCalendar = async (
  accessToken: string,
  eventId: string
): Promise<void> => {
  try {
    const calendarId = await getOrCreateKinesioSpaCalendar(accessToken);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      let msg = response.statusText || `Estado ${response.status}`;
      try {
        const errJson = JSON.parse(errBody);
        if (errJson?.error?.message) {
          msg = errJson.error.message;
        }
      } catch (e) {}
      throw new Error(`Fallo al eliminar turno en Google Calendar (${response.status}): ${msg}`);
    }
  } catch (error) {
    console.error("Error al eliminar turno en Google Calendar:", error);
    throw error;
  }
};
