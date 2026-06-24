import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Activity, 
  Sparkles, 
  Zap, 
  Calendar as CalendarIcon, 
  Clock, 
  Phone, 
  User, 
  Plus, 
  Trash2, 
  Search, 
  RefreshCw, 
  LogOut, 
  Heart, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  ShieldAlert, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  MessageSquare,
  MapPin,
  Clock3,
  CalendarDays
} from "lucide-react";
import { Appointment, TimeSlot, ServiceTypeInfo } from "./types";
import { SERVICE_TYPES, WORKING_HOURS } from "./data";
import { 
  initAuth, 
  googleSignIn, 
  logoutUser, 
  fetchAppointments, 
  createAppointmentInCalendar, 
  deleteAppointmentInCalendar 
} from "./googleCalendarService";
import { User as FirebaseUser } from "firebase/auth";

export default function App() {
  // --- AUTH STATE ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- BUSINESS STATE ---
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slotDuration, setSlotDuration] = useState<30 | 60>(60);
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>("Todos");
  
  // --- DATA STATE ---
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);

  // --- SEARCH AND FILTERS ---
  const [searchTerm, setSearchTerm] = useState("");

  // --- BOOKING MODAL STATE ---
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<TimeSlot | null>(null);
  const [bookingForm, setBookingForm] = useState({
    patientName: "",
    contactNumber: "",
    serviceType: "Kinesiología" as "Kinesiología" | "Fisioterapia" | "Spa",
    notes: ""
  });
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  // --- DETAILS AND CANCELLATION STATE ---
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // --- TOAST FEEDBACK ---
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- AUTH INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // --- LOAD EVENTS FOR DATE & WEEK ---
  const loadData = async (accessToken: string) => {
    if (!accessToken) return;
    setLoadingEvents(true);
    try {
      // 1. Fetch appointments for the selected day
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const appointments = await fetchAppointments(accessToken, startOfDay, endOfDay);
      setDayAppointments(appointments);

      // 2. Fetch upcoming appointments (next 7 days) to display on sidebar
      loadUpcomingData(accessToken);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "";
      if (
        errMsg.includes("401") || 
        errMsg.toLowerCase().includes("invalid credentials") || 
        errMsg.toLowerCase().includes("expired") ||
        errMsg.toLowerCase().includes("auth")
      ) {
        showToast("Su sesión de Google Calendar ha expirado. Por favor, inicie sesión nuevamente.", "error");
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      } else {
        showToast(`Error de sincronización: ${errMsg}`, "error");
      }
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadUpcomingData = async (accessToken: string) => {
    setLoadingUpcoming(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(todayStart.getDate() + 7);
      sevenDaysLater.setHours(23, 59, 59, 999);

      const appointments = await fetchAppointments(accessToken, todayStart, sevenDaysLater);
      // Sort upcoming events chronologically
      const sorted = appointments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      setUpcomingAppointments(sorted);
    } catch (err: any) {
      console.error("Error al obtener turnos futuros:", err);
      // If it's an auth error, we handle it in loadData. Avoid double toast.
    } finally {
      setLoadingUpcoming(false);
    }
  };

  // Reload when date or token changes
  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [selectedDate, token]);

  // --- GOOGLE SIGN IN HANDLER ---
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        showToast(`Sesión iniciada como ${result.user.displayName || "Administrador"}`, "success");
      }
    } catch (err: any) {
      console.error("Error al iniciar sesión:", err);
      if (err.code === "auth/popup-closed-by-user") {
        showToast("Inicio de sesión cancelado (ventana cerrada por el usuario).", "info");
      } else {
        showToast(`Error de autenticación Google: ${err.message || err}`, "error");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- LOGOUT HANDLER ---
  const handleLogout = async () => {
    if (window.confirm("¿Seguro que desea cerrar sesión en KinesioSpa?")) {
      await logoutUser();
      setToken(null);
      setUser(null);
      setNeedsAuth(true);
      showToast("Sesión cerrada", "info");
    }
  };

  // --- GENERATE DAILY TIME SLOTS ---
  const generateTimeSlots = (): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const baseHour = WORKING_HOURS.start;
    const endHour = WORKING_HOURS.end;
    const intervalMinutes = slotDuration;

    let current = new Date(selectedDate);
    current.setHours(baseHour, 0, 0, 0);

    const endBoundary = new Date(selectedDate);
    endBoundary.setHours(endHour, 0, 0, 0);

    while (current < endBoundary) {
      const slotStart = new Date(current);
      const slotEnd = new Date(current.getTime() + intervalMinutes * 60 * 1000);

      const timeString = slotStart.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

      // Check overlaps with day appointments
      // Overlap rule: ApptStart < SlotEnd AND ApptEnd > SlotStart
      const overlappingAppt = dayAppointments.find(appt => {
        const apptStart = new Date(appt.start);
        const apptEnd = new Date(appt.end);
        return apptStart < slotEnd && apptEnd > slotStart;
      });

      // Apply service type filter if active
      let isVisible = true;
      if (overlappingAppt && selectedServiceFilter !== "Todos") {
        isVisible = overlappingAppt.serviceType === selectedServiceFilter;
      }

      if (isVisible) {
        slots.push({
          time: timeString,
          datetimeStart: slotStart,
          datetimeEnd: slotEnd,
          available: !overlappingAppt,
          appointment: overlappingAppt
        });
      }

      // Advance clock
      current = new Date(current.getTime() + intervalMinutes * 60 * 1000);
    }

    return slots;
  };

  // --- HANDLERS FOR APPOINTMENTS ---
  const openBookingModal = (slot: TimeSlot) => {
    setBookingSlot(slot);
    setBookingForm({
      patientName: "",
      contactNumber: "",
      serviceType: "Kinesiología",
      notes: ""
    });
    setShowBookingModal(true);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !bookingSlot) return;
    if (!bookingForm.patientName.trim()) {
      showToast("Por favor, ingrese el nombre del paciente", "error");
      return;
    }
    if (!bookingForm.contactNumber.trim()) {
      showToast("Por favor, ingrese un número de contacto", "error");
      return;
    }

    setIsBookingSubmitting(true);
    try {
      const newAppt: Omit<Appointment, "id"> = {
        patientName: bookingForm.patientName.trim(),
        contactNumber: bookingForm.contactNumber.trim(),
        serviceType: bookingForm.serviceType,
        start: bookingSlot.datetimeStart.toISOString(),
        end: bookingSlot.datetimeEnd.toISOString(),
        notes: bookingForm.notes.trim() || undefined
      };

      await createAppointmentInCalendar(token, newAppt);
      showToast("¡Turno agendado en Google Calendar con éxito!", "success");
      setShowBookingModal(false);
      // Refresh list
      loadData(token);
    } catch (err: any) {
      console.error(err);
      showToast("No se pudo agendar el turno. Intente nuevamente.", "error");
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!token || !activeAppointment) return;
    setIsCancelling(true);
    try {
      await deleteAppointmentInCalendar(token, activeAppointment.id);
      showToast("¡Turno cancelado y removido de Google Calendar!", "success");
      setShowCancelConfirm(false);
      setActiveAppointment(null);
      // Refresh list
      loadData(token);
    } catch (err: any) {
      console.error(err);
      showToast("Error al cancelar el turno", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  // --- DATE NAVIGATION UTILS ---
  const adjustDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const setToday = () => {
    setSelectedDate(new Date());
  };

  const formatDateSpanish = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: "long", 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    };
    return date.toLocaleDateString("es-ES", options);
  };

  // --- FILTERED UPCOMING FOR SIDEBAR ---
  const filteredUpcoming = upcomingAppointments.filter(appt => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      appt.patientName.toLowerCase().includes(searchLower) ||
      appt.contactNumber.includes(searchTerm);
    
    const matchesService = 
      selectedServiceFilter === "Todos" || 
      appt.serviceType === selectedServiceFilter;

    return matchesSearch && matchesService;
  });

  const getServiceIcon = (type: string) => {
    switch (type) {
      case "Kinesiología": return <Activity className="w-4 h-4" />;
      case "Fisioterapia": return <Zap className="w-4 h-4" />;
      case "Spa": return <Sparkles className="w-4 h-4" />;
      default: return <Heart className="w-4 h-4" />;
    }
  };

  const getServiceColorClasses = (type: string) => {
    switch (type) {
      case "Kinesiología":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
      case "Fisioterapia":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900";
      case "Spa":
        return "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-900";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-850 dark:text-slate-300";
    }
  };

  // --- LOGIN PAGE RENDER ---
  if (needsAuth) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between selection:bg-emerald-500 selection:text-white transition-colors duration-300">
        {/* Decorative background shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-b from-emerald-100/30 to-teal-50/20 dark:from-emerald-950/10 dark:to-teal-950/5 rounded-full blur-3xl -mr-64 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-t from-indigo-100/20 to-teal-100/10 dark:from-indigo-950/5 dark:to-teal-950/5 rounded-full blur-3xl -ml-48 -mb-32"></div>
        </div>

        {/* Top Navbar */}
        <header className="relative w-full py-5 px-6 border-b border-slate-200/60 dark:border-slate-900/60 flex justify-between items-center bg-white/70 dark:bg-slate-950/70 backdrop-blur-md">
          <div className="flex items-center space-x-2">
            <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-lg shadow-emerald-500/20">
              <Heart className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-white">KinesioSpa Hub</span>
              <span className="block text-[10px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold">Gestión Profesional</span>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>PLATAFORMA CERTIFICADA</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          </div>
        </header>

        {/* Main Content Hero */}
        <main className="relative flex-grow flex items-center justify-center p-6">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl rounded-3xl p-8 md:p-10 text-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500"></div>
            
            <div className="mx-auto w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl flex items-center justify-center text-emerald-500 dark:text-emerald-400 mb-6">
              <CalendarIcon className="w-8 h-8" />
            </div>

            <h1 className="font-display text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
              Gestor de Turnos Inteligente
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base max-w-md mx-auto mb-8">
              Organice y sincronice las citas de sus pacientes de Kinesiología, Fisioterapia y Spa de forma directa con su Google Calendar institucional.
            </p>

            {/* Quick Benefits Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-left">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/30">
                <div className="text-emerald-500 dark:text-emerald-400 mb-1">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">Turnos Flexibles</div>
                <div className="text-[10px] text-slate-500">Bloques de 30 min y 1 hora.</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/30">
                <div className="text-indigo-500 dark:text-indigo-400 mb-1">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">Contacto Directo</div>
                <div className="text-[10px] text-slate-500">Números telefónicos integrados.</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/30">
                <div className="text-teal-500 dark:text-teal-400 mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">Sincronización Total</div>
                <div className="text-[10px] text-slate-500">Google Calendar API oficial.</div>
              </div>
            </div>

            {/* Google Sign In Material Button */}
            <div className="flex justify-center">
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button w-full sm:w-auto"
                id="google-signin-btn"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isLoggingIn ? "Conectando con Google..." : "Iniciar Sesión con Google"}
                  </span>
                </div>
              </button>
            </div>

            <div className="mt-6 text-xs font-mono text-slate-400">
              Requiere acceso seguro a Google Calendar para guardar sus agendas.
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 border-t border-slate-200/50 dark:border-slate-900/50 text-center bg-white/50 dark:bg-slate-950/50 text-xs text-slate-500">
          <p>© 2026 KinesioSpa Hub. Desarrollado con seguridad y privacidad total de extremo a extremo.</p>
        </footer>
      </div>
    );
  }

  const timeSlots = generateTimeSlots();
  const totalSlotsCount = timeSlots.length;
  const bookedSlotsCount = timeSlots.filter(s => !s.available).length;
  const availableSlotsCount = totalSlotsCount - bookedSlotsCount;

  // --- COMPONENT MARKUP ---
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 selection:bg-emerald-500 selection:text-white text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 flex flex-col">
      
      {/* Header Panel */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-900/60 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-500 text-white p-2.5 rounded-2xl shadow-md shadow-emerald-500/20">
            <Heart className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="font-display font-black text-xl tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              KinesioSpa Hub
              <span className="text-xs font-normal font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                Live Calendar
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Gestor de Turnos Corporativo</p>
          </div>
        </div>

        {/* Sync Info / Google Auth Info */}
        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <div className="flex items-center space-x-3 bg-slate-100/80 dark:bg-slate-900/80 px-3.5 py-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 text-sm">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "Avatar"} className="w-6 h-6 rounded-full ring-2 ring-emerald-500/30" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-xs font-mono">
                  {user.displayName?.charAt(0) || "U"}
                </div>
              )}
              <div className="text-left leading-tight hidden sm:block">
                <span className="block font-semibold text-xs text-slate-800 dark:text-slate-200">{user.displayName || "Usuario"}</span>
                <span className="block text-[10px] text-slate-500">{user.email}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="hover:text-red-500 text-slate-500 dark:text-slate-400 p-1 rounded-lg transition-colors"
                title="Cerrar Sesión"
                id="logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={() => token && loadData(token)}
            disabled={loadingEvents}
            className="flex items-center space-x-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 px-4 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 transition duration-150 disabled:opacity-50 cursor-pointer shadow-sm"
            id="sync-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? "animate-spin" : ""}`} />
            <span>{loadingEvents ? "Sincronizando..." : "Sincronizar"}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Columna Izquierda: Controles e Indicadores */}
        <aside className="lg:col-span-3 space-y-6">
          
          {/* Tarjeta de Servicio Activo / Duración */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-500" />
              Configuración de Vista
            </h3>

            {/* Selector de Duración de Turno */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Intervalo de Agenda</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                <button
                  onClick={() => setSlotDuration(30)}
                  className={`py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                    slotDuration === 30
                      ? "bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                  id="duration-30-btn"
                >
                  30 Minutos
                </button>
                <button
                  onClick={() => setSlotDuration(60)}
                  className={`py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                    slotDuration === 60
                      ? "bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                  id="duration-60-btn"
                >
                  1 Hora
                </button>
              </div>
            </div>

            {/* Selector de Fecha Nativo */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Seleccionar Fecha</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate.toISOString().split("T")[0]}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(new Date(e.target.value + "T12:00:00"));
                    }
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Filtro por Tipo de Servicio */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">Filtrar Especialidad</label>
              <div className="flex flex-col gap-1.5">
                {["Todos", "Kinesiología", "Fisioterapia", "Spa"].map((serv) => (
                  <button
                    key={serv}
                    onClick={() => setSelectedServiceFilter(serv)}
                    className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-between ${
                      selectedServiceFilter === serv
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-transparent border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {serv !== "Todos" && getServiceIcon(serv)}
                      {serv}
                    </span>
                    {selectedServiceFilter === serv && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tarjeta de Métricas de Hoy */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm text-left">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Métricas del Día
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-xs text-slate-500 font-medium">Capacidad Total</span>
                <span className="text-xs font-bold font-mono">{totalSlotsCount} turnos</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/50 text-amber-600 dark:text-amber-400">
                <span className="text-xs font-medium">Reservas Agendadas</span>
                <span className="text-xs font-bold font-mono">{bookedSlotsCount} turnos</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/50 text-emerald-600 dark:text-emerald-400">
                <span className="text-xs font-medium">Disponibles</span>
                <span className="text-xs font-bold font-mono">{availableSlotsCount} libres</span>
              </div>
              <div className="pt-2">
                <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-500" 
                    style={{ width: `${totalSlotsCount ? (bookedSlotsCount / totalSlotsCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="block text-[10px] text-slate-400 mt-1.5 font-medium text-center">
                  Ocupación de agenda: {totalSlotsCount ? Math.round((bookedSlotsCount / totalSlotsCount) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Información del Negocio KinesioSpa */}
          <div className="p-4 bg-slate-100 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Compañía KinesioSpa</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Atención integral de lunes a domingos de 08:00 a 20:00 hs. Todos los turnos agendados en esta plataforma se sincronizan automáticamente en Google Calendar de manera bidireccional y segura.
            </p>
          </div>

        </aside>

        {/* Columna Central: Cuadrícula de Turnos */}
        <main className="lg:col-span-6 space-y-6">
          
          {/* Navegador de Fecha Superior */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <button 
                onClick={() => adjustDate(-1)}
                className="p-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                id="prev-day-btn"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={setToday}
                className="text-xs px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold transition cursor-pointer"
                id="today-btn"
              >
                Hoy
              </button>
              <button 
                onClick={() => adjustDate(1)}
                className="p-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                id="next-day-btn"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-right">
              <h2 className="font-display font-extrabold text-sm md:text-base capitalize text-slate-900 dark:text-white">
                {formatDateSpanish(selectedDate)}
              </h2>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Atención habilitada Lunes a Domingo
              </span>
            </div>
          </div>

          {/* Slots Container / List */}
          <div className="space-y-3">
            {loadingEvents ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-12 text-center shadow-sm">
                <RefreshCw className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-4" />
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Sincronizando agendas...</h3>
                <p className="text-slate-500 text-xs mt-1">Conectando a la API de Google Calendar en tiempo real</p>
              </div>
            ) : timeSlots.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-12 text-center shadow-sm">
                <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Sin turnos en este intervalo</h3>
                <p className="text-slate-500 text-xs mt-1">Por favor ajuste los filtros de especialidad o el rango de tiempo.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest pl-2 flex items-center justify-between">
                  <span>Horarios Disponibles</span>
                  <span>{timeSlots.length} Bloques</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {timeSlots.map((slot, index) => {
                    const isAvailable = slot.available;
                    const appt = slot.appointment;

                    return (
                      <div
                        key={slot.time + "-" + index}
                        className={`group border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-150 ${
                          isAvailable
                            ? "bg-white dark:bg-slate-900 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-300 dark:hover:border-emerald-900/40"
                            : "bg-slate-100/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/40"
                        }`}
                      >
                        {/* Left Side: Time and status indicator */}
                        <div className="flex items-center space-x-3.5">
                          <div className={`p-2 rounded-xl flex flex-col items-center justify-center font-mono w-14 border ${
                            isAvailable
                              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900"
                              : "bg-slate-100 dark:bg-slate-850 text-slate-500 border-slate-200/50 dark:border-slate-800"
                          }`}>
                            <Clock3 className="w-3.5 h-3.5 mb-1" />
                            <span className="text-xs font-extrabold">{slot.time}</span>
                          </div>

                          <div>
                            {isAvailable ? (
                              <div>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Libre
                                </span>
                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">Horario disponible para reserva</h4>
                              </div>
                            ) : (
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${getServiceColorClasses(appt!.serviceType)}`}>
                                    {getServiceIcon(appt!.serviceType)}
                                    {appt!.serviceType}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Ref: {appt!.id.substring(0, 6)}
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                                  {appt!.patientName}
                                </h4>
                                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 font-medium">
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {appt!.contactNumber}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Side: Action Button */}
                        <div className="w-full sm:w-auto text-right self-stretch sm:self-center flex items-center justify-end">
                          {isAvailable ? (
                            <button
                              onClick={() => openBookingModal(slot)}
                              className="w-full sm:w-auto bg-slate-900 dark:bg-slate-800 hover:bg-emerald-600 dark:hover:bg-emerald-600 hover:text-white text-white px-4 py-2 rounded-xl text-xs font-extrabold transition duration-150 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                              id={`book-${slot.time}-btn`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Reservar
                            </button>
                          ) : (
                            <button
                              onClick={() => setActiveAppointment(appt!)}
                              className="w-full sm:w-auto bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 px-4 py-2 rounded-xl text-xs font-bold transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                              id={`detail-${appt!.id}-btn`}
                            >
                              Ver Detalle
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Columna Derecha: Buscador y Próximos Turnos (7 días) */}
        <aside className="lg:col-span-3 space-y-6">
          
          {/* Panel de Próximos Turnos */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4 text-left">
            <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" />
              Próximos Turnos
            </h3>

            {/* Buscador de Paciente/Teléfono */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar paciente o fono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Listado de Próximos Turnos */}
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {loadingUpcoming ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-500 mx-auto mb-1.5" />
                  Cargando próximos turnos...
                </div>
              ) : filteredUpcoming.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-100 dark:border-slate-800/60 rounded-xl">
                  No hay turnos agendados {searchTerm ? "que coincidan" : "en los próximos 7 días"}.
                </div>
              ) : (
                filteredUpcoming.map((appt) => {
                  const apptDate = new Date(appt.start);
                  const isToday = apptDate.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={appt.id}
                      onClick={() => setActiveAppointment(appt)}
                      className="group p-3 bg-slate-50 hover:bg-indigo-50/20 dark:bg-slate-950/40 dark:hover:bg-slate-900/60 border border-slate-100 dark:border-slate-800/40 hover:border-indigo-200 dark:hover:border-indigo-900/40 rounded-xl transition-all duration-150 cursor-pointer"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold border uppercase tracking-wider ${getServiceColorClasses(appt.serviceType)}`}>
                          {appt.serviceType}
                        </span>
                        <span className={`text-[9px] font-mono font-extrabold ${isToday ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>
                          {isToday ? "Hoy" : apptDate.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                      
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 truncate">
                        {appt.patientName}
                      </h4>

                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {apptDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </span>
                        <span>{appt.contactNumber}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tarjeta Informativa de Ayuda */}
          <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/10 border border-indigo-200/30 dark:border-indigo-900/30 rounded-2xl text-left">
            <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Sugerencia de Uso
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              La API de Google Calendar actualiza los cambios al instante. Si crea o borra un turno en su aplicación de Google, presione el botón <strong>Sincronizar</strong> arriba para refrescar la vista.
            </p>
          </div>

        </aside>
      </div>

      {/* --- REGISTRATION / BOOKING MODAL --- */}
      <AnimatePresence>
        {showBookingModal && bookingSlot && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-left"
            >
              {/* Header */}
              <div className="bg-slate-50 dark:bg-slate-950 p-6 border-b border-slate-150 dark:border-slate-800/80 flex justify-between items-center">
                <div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Nueva Reserva
                  </span>
                  <h3 className="font-display font-extrabold text-lg text-slate-950 dark:text-white mt-1">Agendar Turno de Salud</h3>
                </div>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-2 text-sm font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleBookingSubmit} className="p-6 space-y-4">
                
                {/* Appointment Schedule Info */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest text-slate-400">Fecha del turno</span>
                    <span className="text-slate-900 dark:text-white font-bold">{selectedDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest text-slate-400">Hora seleccionada</span>
                    <span className="text-slate-900 dark:text-white font-bold">{bookingSlot.time} hs</span>
                  </div>
                </div>

                {/* Patient Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Nombre del Paciente <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ej. Juan Carlos Pérez"
                      required
                      value={bookingForm.patientName}
                      onChange={(e) => setBookingForm({ ...bookingForm, patientName: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Contact Number */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Número de Contacto <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="Ej. +54 9 11 1234-5678"
                      required
                      value={bookingForm.contactNumber}
                      onChange={(e) => setBookingForm({ ...bookingForm, contactNumber: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Service Type Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Especialidad / Servicio
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {SERVICE_TYPES.map((service) => {
                      const isSelected = bookingForm.serviceType === service.name;
                      return (
                        <button
                          key={service.name}
                          type="button"
                          onClick={() => setBookingForm({ ...bookingForm, serviceType: service.name as any })}
                          className={`p-3 rounded-2xl border text-center transition duration-150 cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                            isSelected
                              ? "bg-slate-950 border-slate-950 text-white dark:bg-slate-800 dark:border-slate-700"
                              : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {getServiceIcon(service.name)}
                          <span className="text-xs font-extrabold">{service.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Observaciones / Notas
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Detalles sobre dolor, antecedentes o derivaciones médicas..."
                    value={bookingForm.notes}
                    onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setShowBookingModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 text-slate-700 dark:text-slate-300 hover:bg-slate-50 text-xs font-bold transition duration-150 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isBookingSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-md shadow-emerald-500/20 transition duration-150 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    id="confirm-booking-btn"
                  >
                    {isBookingSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Agendando...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Reservar Turno
                      </>
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- DETAIL / DISMISS MODAL --- */}
      <AnimatePresence>
        {activeAppointment && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden text-left"
            >
              {/* Conditional warning layout */}
              {showCancelConfirm ? (
                <div className="p-6 space-y-4">
                  <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center text-red-600 mb-2">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-display font-extrabold text-lg text-slate-900 dark:text-white">¿Confirmar cancelación?</h3>
                    <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                      Esta operación eliminará permanentemente la cita de <strong>{activeAppointment.patientName}</strong> de su Google Calendar. Esta acción no se puede deshacer.
                    </p>
                  </div>
                  
                  <div className="pt-2 flex items-center justify-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
                    >
                      Volver Atrás
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelAppointment}
                      disabled={isCancelling}
                      className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-red-600/10 transition cursor-pointer flex items-center gap-1"
                      id="confirm-delete-btn"
                    >
                      {isCancelling ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Cancelando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          Confirmar Cancelación
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-150 dark:border-slate-800/80 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${getServiceColorClasses(activeAppointment.serviceType)}`}>
                        {getServiceIcon(activeAppointment.serviceType)}
                        {activeAppointment.serviceType}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveAppointment(null)}
                      className="text-slate-400 hover:text-slate-600 p-2 text-sm font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Body content */}
                  <div className="p-6 space-y-4">
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Paciente</span>
                      <h3 className="font-display font-extrabold text-xl text-slate-950 dark:text-white mt-0.5">
                        {activeAppointment.patientName}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Horario de Inicio</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {new Date(activeAppointment.start).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })} hs
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Horario de Fin</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {new Date(activeAppointment.end).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })} hs
                        </span>
                      </div>
                    </div>

                    {/* Contact details */}
                    <div className="space-y-1 text-sm border-t border-slate-100 dark:border-slate-800/60 pt-3">
                      <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Contacto</span>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {activeAppointment.contactNumber}
                        </span>
                        
                        <div className="flex gap-1.5">
                          {/* Direct Whatsapp link helper */}
                          <a
                            href={`https://wa.me/${activeAppointment.contactNumber.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 transition"
                            title="Enviar WhatsApp"
                          >
                            <MessageSquare className="w-3 h-3" />
                            WhatsApp
                          </a>
                          
                          {/* Direct click to call */}
                          <a
                            href={`tel:${activeAppointment.contactNumber}`}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 transition"
                          >
                            <Phone className="w-3 h-3" />
                            Llamar
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    {activeAppointment.notes && (
                      <div className="border-t border-slate-100 dark:border-slate-800/60 pt-3 text-sm">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Observaciones</span>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl leading-relaxed">
                          {activeAppointment.notes}
                        </p>
                      </div>
                    )}

                    {/* External links */}
                    {activeAppointment.htmlLink && (
                      <div className="pt-2 text-center">
                        <a
                          href={activeAppointment.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-semibold"
                        >
                          Ver en Google Calendar
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Bottom Actions */}
                  <div className="pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 mt-4">
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/20 text-red-600 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-red-100 dark:border-red-900/30"
                        id="delete-shift-btn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Cancelar Turno
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveAppointment(null)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>
                  </>
                )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- FLOATING TOAST BANNER --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm"
          >
            <div className={`p-4 rounded-2xl shadow-xl flex items-start gap-3 border ${
              toast.type === "success" 
                ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
                : toast.type === "error"
                  ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900 text-red-800 dark:text-red-200"
                  : "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900 text-blue-800 dark:text-blue-200"
            }`}>
              {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
              {toast.type === "error" && <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />}
              {toast.type === "info" && <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />}
              
              <div>
                <p className="text-xs font-bold">{toast.message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
