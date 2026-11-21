import { t } from './i18n'
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

const TOKEN_KEY = 'aqua_token'

export type RecordActor = { name: string; at: string; role: string | null }

export type Attribution = {
  entered_by?: RecordActor | null
  updated_by?: RecordActor | null
}

export type EstimateBasis = {
  basis?: 'aqua_estimate' | null
  basis_note?: string | null
}

type FarmIdentity = Attribution & {
  id: number
  name: string
  demo?: boolean
}

export type Role = 'viewer' | 'technician' | 'manager' | 'owner' | 'admin'
export type PlotStatus = 'ok' | 'dry' | 'critical' | 'rain_wait' | 'tank_low' | 'no_data'
export type DecisionAction = 'irrigate' | 'light' | 'wait' | 'skip'
export type SoilType = 'sand' | 'sandy_loam' | 'loam' | 'clay_loam' | 'clay'
export type Irrigation = 'drip' | 'sprinkler' | 'flood'
export type WaterVerdictStatus = 'ok' | 'tight' | 'short' | 'no_sources'
export type LivestockSpeciesId =
  | 'dairy_cow'
  | 'beef_cattle'
  | 'sheep'
  | 'goat'
  | 'horse'
  | 'donkey'
  | 'camel'
  | 'pig'
  | 'chicken'
  | 'turkey'
  | 'rabbit'

export function isSoilType(value: string): value is SoilType {
  return (
    value === 'sand' ||
    value === 'sandy_loam' ||
    value === 'loam' ||
    value === 'clay_loam' ||
    value === 'clay'
  )
}

export function isIrrigation(value: string): value is Irrigation {
  return value === 'drip' || value === 'sprinkler' || value === 'flood'
}

export function isLivestockSpeciesId(value: string): value is LivestockSpeciesId {
  return (
    value === 'dairy_cow' ||
    value === 'beef_cattle' ||
    value === 'sheep' ||
    value === 'goat' ||
    value === 'horse' ||
    value === 'donkey' ||
    value === 'camel' ||
    value === 'pig' ||
    value === 'chicken' ||
    value === 'turkey' ||
    value === 'rabbit'
  )
}

export type AccountType = 'farmer' | 'worker'
export type ProfileVisibility = 'public' | 'private'
export type ProfileKind = 'task' | 'period' | 'long_term'
export type EngagementKind = 'temporary' | 'full_time'
export type EngagementStatus = 'active' | 'finished' | 'disapproved'

export type User = {
  id: number
  email: string
  name: string
  role: string
  active?: boolean
  account_type: AccountType
  photo: string | null
  farm_count?: number
  accessible_farm_count?: number
}

export type Profile = Attribution & {
  demo?: boolean
  user_id: number
  name: string
  account_type: AccountType
  headline: string
  bio: string
  governorate: string
  visibility: ProfileVisibility
  radius_km: number
  looking_for_work: boolean
  kinds: ProfileKind[]
  skills: string[]
  languages: string[]
  availability: string
  photo: string | null
  updated_at: string
}

export type MyProfile = Profile & {
  complete: boolean
  farm_count: number
  email: string
}

export type PublicWorkAt = Attribution & {
  demo?: boolean
  farm: string
  title: string
  kind: EngagementKind
}

export type PublicVerifiedWork = Attribution & {
  demo?: boolean
  farm: string
  title: string
  kind: EngagementKind
  start_date: string | null
  end_date: string | null
  note: string
}

export type PublicProfile = Profile & {
  works_at: PublicWorkAt[]
  verified_work: PublicVerifiedWork[]
}

export type Engagement = Attribution & {
  id: number
  title: string
  kind: EngagementKind
  status: EngagementStatus
  start_date: string | null
  end_date: string | null
  note: string
  reason?: string
  created_at: string
  closed_at: string | null
  upgraded_from_id: number | null
  farm: FarmIdentity & { region: string }
  worker?: { id: number; name: string; photo?: string | null }
}

export type WorkerHomeApplications = {
  pending: number | null
  accepted: number | null
  declined: number | null
  total: number | null
}

export type WorkerHomeProfile = Attribution & {
  demo?: boolean
  complete: boolean
  has_location: boolean
  visibility: ProfileVisibility
  has_cv: boolean
}

export type WorkerHome = {
  account_type: AccountType
  name: string
  active_work: Engagement[]
  past_work_count: number | null
  applications: WorkerHomeApplications
  opportunities_nearby: number | null
  unread_messages: number | null
  profile: WorkerHomeProfile
  has_farm: boolean
}

export type AccountSwitch = {
  account_type: AccountType
  farm_count: number
  has_farm: boolean
}

export type MessageSide = 'farm' | 'worker'

export type ReportReason = 'scam' | 'no_show' | 'unsafe' | 'harassment' | 'other'
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export type Report = Attribution & {
  demo?: boolean
  id: number
  reason: ReportReason
  details: string
  status: ReportStatus
  engagement_id: number | null
  created_at: string
  resolved_at: string | null
  target: { id: number; name: string }
  admin_note?: string
}

export type AdminReport = Omit<Report, 'target' | 'admin_note'> & {
  reporter: { id: number; name: string; email: string }
  admin_note: string
  target: {
    id: number
    name: string
    email: string
    active: boolean
    reports_against: number
  }
}

export type ReportBody = {
  target_user_id: number
  reason: ReportReason
  details: string
  engagement_id?: number | null
}

export type AdminReportPatch = {
  status?: ReportStatus
  admin_note?: string
  suspend?: boolean
}

export type MessageThread = Attribution & {
  demo?: boolean
  engagement_id: number
  side: MessageSide
  with: string
  farm: string
  title: string
  status: EngagementStatus
  unread: number
  last_message: string | null
  last_at: string
}

export type EngagementMessage = Attribution & {
  id: number
  body: string
  mine: boolean
  created_at: string
  read: boolean
  sender: string
}

export type MessagesUnread = {
  total: number
  by_engagement: Record<string, number>
}

export type ProfileBody = {
  headline: string
  bio: string
  governorate: string
  visibility: ProfileVisibility
  radius_km: number
  looking_for_work: boolean
  kinds: ProfileKind[]
  skills: string[]
  languages: string[]
  availability: string
}

export type PlotWrite = {
  name: string
  crop: string
  area_m2: number
  irrigation: Irrigation | string
  soil_type: SoilType | ''
}

export type FarmPlot = PlotWrite & Attribution & {
  id: number
  farm_id: number
}

export type Farm = FarmIdentity & {
  location_source?: 'entered' | 'governorate_centre' | 'unavailable' | null
  region: string
  lat: number
  lon: number
  description: string
  has_sketch: boolean
  area_m2?: number | null
  plots: FarmPlot[]
}

export type Crop = {
  id: string
  label: string
  min_moisture: number
  kc_mid: number
}

export type Weather = {
  rain_prob: number
  rain_mm: number
  max_temp: number
  max_wind: number
  error?: string
}

export type ForecastAlertLevel = 'warning' | 'watch' | 'info'
export type ForecastAlertKind = 'heat' | 'frost' | 'wind' | 'rain'

export type ForecastCurrent = {
  temperature: number
  feels_like: number
  humidity: number
  wind_kmh: number
  gust_kmh: number
  rain_mm: number
  condition: string
  icon: string
  time: string
}

export type ForecastHour = {
  time: string
  temperature: number
  rain_probability: number | null
  rain_mm: number
  wind_kmh: number
  condition: string
  icon: string
}

export type ForecastDay = {
  date: string
  condition: string
  icon: string
  temp_max: number
  temp_min: number
  rain_mm: number
  rain_probability: number | null
  wind_max_kmh: number
  wind_gust_max: number
  et0_mm: number
  uv_index: number | null
  sunrise: string
  sunset: string
}

export type ForecastAlert = {
  level: ForecastAlertLevel
  kind: ForecastAlertKind
  date: string
  title: string
  text: string
}

export type Forecast = EstimateBasis & {
  farm: FarmIdentity & { region: string; lat: number; lon: number; location_source?: string | null }
  source: string
  timezone: string | null
  stale?: boolean
  current: ForecastCurrent
  hourly: ForecastHour[]
  daily: ForecastDay[]
  alerts: ForecastAlert[]
}

/** Where a plot sits on the farmer's drawing, as fractions 0..1 of the drawing. */
export type PlotBox = { x: number; y: number; w: number; h: number }

export type OverviewPlot = Attribution & EstimateBasis & {
  box?: PlotBox | null
  defaulted_fields?: string[] | null
  reading_source?: PlotReading['source']
  reading_entered_by?: RecordActor | null
  id: number
  name: string
  crop: string
  crop_label: string
  area_m2: number
  irrigation: string
  soil_type: SoilType | ''
  target: number | null
  soil_moisture: number | null
  tank_level: number | null
  temperature: number | null
  last_ts: string | null
  status: PlotStatus
  warnings: string[]
}

export type OverviewDecision = EstimateBasis & {
  id: number
  plot_id: number
  plot_name: string
  action: DecisionAction
  why: string
  litres_saved: number
  ts: string
}

export type PlotReading = Attribution & {
  ts: string
  soil_moisture: number | null
  source?: 'device' | 'manual' | 'demo' | null
}

export type Overview = {
  farm: FarmIdentity & { region: string; lat: number; lon: number; location_source?: string | null }
  my_role: Role
  weather: Weather
  plots: OverviewPlot[]
  litres_saved: number
  weekly_savings?: EstimateBasis & { week_start: string; litres: number | null }
  decisions: OverviewDecision[]
}

export type DecisionResult = EstimateBasis & {
  recorded?: boolean
  action: string
  why: string
  litres_saved: number
  weather: { rain_prob: number }
}

export type SoilCard = {
  key: string
  name: string
  texture: string
  ph: string
  organic_matter: string
  water_holding: string
  drainage: string
  salinity_risk: string
  summary: string
  crops: string[]
  tips: string[]
}

export type SoilLive = {
  average_moisture: number | null
  plots_with_readings: number
  plots: number
  rain_next_7_days_mm: number | null
  irrigations_last_14_days: number
  irrigations_basis?: string
  forecast_source?: string | null
  forecast_stale?: boolean | null
}

export type FarmSoil = Attribution & EstimateBasis & {
  source: 'farmer' | 'predicted'
  soil: SoilCard
  description: string
  notes: string[]
  live: SoilLive
  confidence?: number
  reasons?: string[]
  governorate?: string
  updated_at?: string | null
  predicted?: EstimateBasis & { soil: SoilCard; confidence: number }
}

export type ActivityKind =
  | 'irrigation'
  | 'harvest'
  | 'spraying'
  | 'fertilising'
  | 'planting'
  | 'maintenance'
  | 'animals'
  | 'people'
  | 'note'

export type ActivityItem = Attribution & EstimateBasis & {
  id: string
  kind: string
  source: 'system' | 'manual'
  title: string
  detail: string
  at: string
  plot: string | null
  who: string | null
}

export type ActivityLog = {
  days: number
  total: number
  counts: Partial<Record<string, number>>
  items: ActivityItem[]
}

export type WeekMood = 'good' | 'ok' | 'bad'

export type WeeklyReportMeta = Attribution & EstimateBasis & {
  id: number
  week_start: string
  score: number | null
  mood: string
  kind: 'auto' | 'manual'
  created_at: string
}

export type FarmVideo = Attribution & EstimateBasis & {
  id: number
  week_start: string
  mood: string
  status: 'queued' | 'rendering' | 'done' | 'failed'
  error: string
  seconds: number | null
  created_at: string
  finished_at: string | null
  ready: boolean
}

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type ChatAttachment = {
  name: string
  media_type: string
  data: string
}

export type Worker = Attribution & {
  id: number
  name: string
  role_label: string
  photo: string | null
  created_at: string
}

export type TaskStatus = 'pending' | 'done'

export type Task = Attribution & {
  id: number
  worker_id: number
  worker_name: string
  plot_id: number | null
  plot_name: string | null
  title: string
  details: string
  status: TaskStatus
  created_at: string
  done_at: string | null
  completion_source?: 'web' | null
}

export type ProposedTask = {
  worker_id: number | null
  worker_name: string
  plot_id: number | null
  plot_name: string | null
  title: string
  details: string
}

export type ProposedChange = {
  kind: 'change'
  summary: string
  danger: boolean
  done: string
  request: { method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; body: Record<string, unknown> | null }
}

export type ChatReply = {
  reply: string
  proposed_tasks?: ProposedTask[]
  proposed_changes?: ProposedChange[]
}

export type WorkerPlot = {
  id: number
  name: string
  crop_label: string
}

export type WaterKind = 'tank' | 'well' | 'borehole' | 'rain_tank' | 'network' | 'canal'

export type OnboardingPlot = {
  name?: string
  crop: string
  area_m2: number
  irrigation: Irrigation | ''
  soil_type: SoilType | ''
  box?: PlotBox
}

export type SketchRead = {
  source: 'drawing' | 'description'
  ok: boolean
  reason: string
  plots: {
    label: string
    crop: string | null
    crop_confidence: 'high' | 'low'
    share: number | null
    box: PlotBox | null
  }[]
  animals: { species: LivestockSpeciesId; count: number; box?: PlotBox | null }[]
  notes: string[]
}

export type OnboardingSource = {
  kind: WaterKind
  name?: string
  capacity_l?: number | null
  level_l?: number | null
  refill_l_per_day?: number | null
}

export type OnboardingHerd = {
  species: LivestockSpeciesId
  count: number
  place?: string
  box?: PlotBox
}

export type OnboardingFarmerBody = {
  farm: { name: string; governorate: string; description?: string; area_m2?: number | null }
  draft_key?: string
  sketch?: string
  plots: OnboardingPlot[]
  water_sources: OnboardingSource[]
  livestock: OnboardingHerd[]
}

export type OnboardingFarmerResult = {
  farm_id: number
  name: string
  governorate: string
  area_m2: number | null
  planted_area_m2: number
  animal_count: number
  plots: number
  water_sources: number
  animals: number
}

export type FarmAbout = {
  description: string
  has_sketch: boolean
}

export type AiStatus = {
  configured: boolean
}

export type OnboardingSuggest = {
  plots: OnboardingPlot[]
  water_sources: { kind: WaterKind; name: string; capacity_l: number | null }[]
  livestock: OnboardingHerd[]
  notes: string
}

export type WaterSource = Attribution & EstimateBasis & {
  id: number
  kind: WaterKind
  name: string
  capacity_l: number | null
  level_l: number
  refill_l_per_day: number
  notes: string
  level_recorded?: boolean
  refill_recorded?: boolean
  level_entered_by?: RecordActor | null
  fill_percent: number | null
  updated_at: string
}

export type WaterSummary = {
  total_stored_l: number
  total_capacity_l: number
  total_refill_l_per_day: number
  count: number
}

export type WaterSourceBody = {
  kind: WaterKind
  name: string
  capacity_l: number | null
  level_l?: number
  refill_l_per_day?: number
  notes: string
  level_recorded?: boolean
  refill_recorded?: boolean
}

export type LivestockSpecies = {
  id: string
  label: string
  litres_per_head_per_day: number
}

export type LivestockHerd = Attribution & EstimateBasis & {
  id: number
  species: string
  label: string
  count: number
  place?: string
  litres_per_head_per_day: number
  litres_per_day: number
}

export type LivestockList = {
  herds: LivestockHerd[]
  species: LivestockSpecies[]
}

export type FarmAnimalPlace = Attribution & {
  herd_id: number
  place: string
  count: number
  /** where the farmer drew this herd's pen on their drawing (longer side of the drawing = 1); null when not drawn */
  box?: PlotBox | null
}

export type FarmAnimalGroup = EstimateBasis & {
  species: string
  label: string
  total: number
  litres_per_day: number
  places: FarmAnimalPlace[]
}

export type FarmAnimals = {
  groups: FarmAnimalGroup[]
  total_animals: number
  places: string[]
}

export type WaterBalanceHorizon = {
  days: number
  crops_l: number
  animals_l: number
  total_l: number
  supply_l: number
  balance_l: number
  supply_estimate_available?: boolean
}

export type WaterBalancePlot = Attribution & EstimateBasis & {
  id: number
  name: string
  crop: string
  crop_label: string
  soil_type: string
  soil_label: string
  irrigation: string
  area_m2: number
  defaulted_fields?: string[] | null
  efficiency: number
  today_l: number
  week_l: number
  month_l: number
  year_l: number
  interval_days: number
  per_irrigation_l: number
}

export type WaterBalanceAnimal = LivestockHerd & {
  today_l: number
  week_l: number
  month_l: number
  year_l: number
}

export type WaterBalanceDay = {
  date: string
  crops_l: number
  animals_l: number
  total_l: number
  et0_mm: number
  rain_mm: number
  from_forecast: boolean
}

export type WaterBalanceVerdict = {
  status: WaterVerdictStatus
  message: string
  days_left: number | null
  shortfall_l_week: number
  surplus_l_week: number
}

export type WaterBalance = EstimateBasis & {
  as_of: string
  forecast_used: boolean
  forecast_stale?: boolean | null
  supply: { stored_l: number; refill_l_per_day: number; sources: number; measurements_incomplete?: boolean }
  horizons: {
    today: WaterBalanceHorizon
    week: WaterBalanceHorizon
    month: WaterBalanceHorizon
    year: WaterBalanceHorizon
  }
  plots: WaterBalancePlot[]
  animals: WaterBalanceAnimal[]
  daily: WaterBalanceDay[]
  verdict: WaterBalanceVerdict
  notes: string[]
}

export type MarketPriceMode = 'fixed' | 'free' | 'negotiable'
export type MarketFulfilment = 'pickup' | 'delivery' | 'both'
export type MarketListingStatus = 'active' | 'paused' | 'closed'
export type MarketInquiryStatus = 'new' | 'read' | 'accepted' | 'declined'
export type MarketSort = 'newest' | 'price' | 'distance' | 'volume'

export type MarketGovernorate = {
  name: string
  lat: number
  lon: number
}

export type MarketMeta = {
  governorates: MarketGovernorate[]
  sources: string[]
}

export type MarketInquiry = Attribution & {
  demo?: boolean
  id: number
  listing_id: number
  listing_title: string
  message: string
  status: MarketInquiryStatus
  created_at: string
  farm_name?: string
  sender?: { id: number; name: string; email: string }
}

export type MarketListing = Attribution & EstimateBasis & {
  id: number
  title: string
  description: string
  litres_available: number
  price_mode: MarketPriceMode
  price_per_m3: number | null
  water_source: WaterKind
  quality_notes: string
  fulfilment: MarketFulfilment
  delivery_radius_km: number | null
  available_from: string | null
  available_until: string | null
  governorate: string
  address_text: string
  lat: number | null
  lon: number | null
  photos: string[]
  status: MarketListingStatus
  farm: FarmIdentity & { region: string }
  distance_km: number | null
  is_mine: boolean
  created_at: string
  updated_at: string
  inquiry_count?: number
  new_inquiries?: number
  my_inquiry?: MarketInquiry | null
}

export type MarketListingBody = {
  title: string
  description: string
  litres_available: number
  price_mode: MarketPriceMode
  price_per_m3: number | null
  water_source: WaterKind
  quality_notes: string
  fulfilment: MarketFulfilment
  delivery_radius_km: number | null
  available_from: string | null
  available_until: string | null
  governorate: string
  address_text: string
  lat: number | null
  lon: number | null
  photos: string[]
  status: MarketListingStatus
}

export type MarketListingsPage = {
  total: number
  items: MarketListing[]
}

export type MarketPhoto = {
  filename: string
  url: string
}

export type MarketListingsQuery = {
  q?: string
  governorate?: string
  fulfilment?: 'pickup' | 'delivery'
  source?: string
  max_price?: number
  min_litres?: number
  sort?: MarketSort
  near_farm_id?: number
  limit?: number
  offset?: number
}

export type JobKind = 'task' | 'period' | 'long_term'
export type JobPayMode = 'fixed' | 'negotiable'
export type JobPayUnit = 'hour' | 'day' | 'task' | 'week' | 'month'
export type JobStatus = 'open' | 'filled' | 'closed'
export type JobSort = 'newest' | 'pay' | 'distance'
export type JobOffer = Attribution & {
  id: number
  job_id: number
  job_title: string
  message: string
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  created_at: string
  demo: boolean
  worker?: { id: number; name: string }
  farm_name?: string
  farm_region?: string
  kind?: string
  governorate?: string
  pay_mode?: string
  pay_amount?: number | null
  pay_unit?: string | null
  start_date?: string | null
  end_date?: string | null
  job_status?: string
}

export type JobApplicationStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

export type JobApplication = Attribution & {
  demo?: boolean
  id: number
  job_id: number
  job_title: string
  message: string
  status: JobApplicationStatus
  created_at: string
  farm_name?: string
  applicant?: { id: number; name: string; email: string }
}

export type Job = Attribution & EstimateBasis & {
  id: number
  title: string
  description: string
  kind: JobKind
  start_date: string | null
  end_date: string | null
  pay_mode: JobPayMode
  pay_amount: number | null
  pay_unit: JobPayUnit | null
  workers_needed: number
  skills: string[]
  governorate: string
  address_text: string
  status: JobStatus
  radius_km: number | null
  farm: FarmIdentity & { region: string }
  distance_km: number | null
  is_mine: boolean
  created_at: string
  updated_at: string
  accepted_count: number
  application_count?: number
  pending_applications?: number
  my_application?: JobApplication | null
}

export type JobBody = {
  title: string
  description: string
  kind: JobKind
  start_date: string | null
  end_date: string | null
  pay_mode: JobPayMode
  pay_amount: number | null
  pay_unit: JobPayUnit | null
  workers_needed: number
  skills: string[]
  governorate: string
  address_text: string
  status: JobStatus
  radius_km: number | null
}

export type JobsPage = {
  total: number
  items: Job[]
}

export type JobsQuery = {
  q?: string
  kind?: JobKind
  governorate?: string
  sort?: JobSort
  near_farm_id?: number
  limit?: number
  offset?: number
}

export type Opportunity = Attribution & EstimateBasis & {
  id: number
  title: string
  kind: JobKind
  pay_mode: JobPayMode
  pay_amount: number | null
  pay_unit: JobPayUnit | null
  start_date: string | null
  end_date: string | null
  workers_needed: number
  skills: string[]
  governorate: string
  farm: FarmIdentity
  distance_km: number
  job_radius_km: number | null
  match: number
  matching_skills: string[]
  applied: boolean
  created_at: string
}

export type OpportunitiesPage = {
  radius_km: number
  location: string
  total: number
  items: Opportunity[]
}

export type OpportunitiesQuery = {
  radius_km?: number
  kinds?: JobKind[]
  skills?: string[]
  q?: string
  limit?: number
  offset?: number
}

export type Candidate = Attribution & EstimateBasis & {
  demo?: boolean
  user_id: number
  name: string
  headline: string
  governorate: string
  photo: string | null
  skills: string[]
  kinds: ProfileKind[]
  languages: string[]
  availability: string
  distance_km: number
  their_radius_km: number
  match: number
  matching_skills: string[]
  has_cv: boolean
}

export type CandidatesPage = {
  radius_km: number
  total: number
  items: Candidate[]
}

export type MemberWorkplace = {
  farm_id: number
  farm: string
  title: string
  accessible: boolean
}

export type DirectoryPerson = Attribution & EstimateBasis & {
  user_id: number
  name: string
  headline: string
  governorate: string
  photo: string | null
  skills: string[]
  languages: string[]
  availability: string
  looking_for_work: boolean
  radius_km: number
  kinds: ProfileKind[]
  on_my_farm: boolean
  distance_km: number | null
  works_at: MemberWorkplace | null
  demo?: boolean
}

export type MembersPage = {
  total: number
  items: DirectoryPerson[]
}

export type CandidatesQuery = {
  radius_km?: number
  job_id?: number
  kinds?: JobKind[]
  skills?: string[]
  q?: string
  limit?: number
  offset?: number
}

export type CvExperience = {
  role: string
  employer: string
  place: string
  start: string
  end: string
  description: string
}

export type CvEducation = {
  school: string
  degree: string
  year: string
}

export type CvLanguage = {
  name: string
  level: string
}

export type CvData = {
  full_name: string
  summary: string
  experience: CvExperience[]
  education: CvEducation[]
  skills: string[]
  languages: CvLanguage[]
  certifications: string[]
}

export type CvSource = 'manual' | 'uploaded' | 'described'

export type PublicCv = Attribution & {
  cv: CvData | null
  source: CvSource | string | null
  updated_at: string | null
}

export type MyCv = PublicCv & {
  has_file: boolean
  file_name?: string | null
  file_type?: string | null
}

export type CvProposal = {
  proposed: CvData
  understood: string
  unsure: string[]
  changes: string
}

export type CvFileInfo = {
  has_file: true
  file_name: string
  file_type: string
}

export type CvApplyResult = {
  skills: string[]
  languages: string[]
  headline: string
}

export type ActuatorKind = 'pump' | 'valve' | 'light' | 'fan' | 'relay'
export type ActuatorState = 'on' | 'off'
export type DeviceCommandAction = 'on' | 'off'
export type DeviceCommandStatus =
  | 'pending'
  | 'delivered'
  | 'done'
  | 'failed'
  | 'expired'
  | 'cancelled'

export type DeviceConnection = 'local' | 'push'

export type DeviceBoardData = {
  tank: number
  tankMin: number
  tankFault?: boolean
  soil: number
  soilNeed: number
  soilRaw?: number
  soilFault?: boolean
  rain: boolean
  rainRaw: number
  temp: number | null
  hum: number | null
  pump: boolean
  pumpLeft?: number
  sinceWater: number
  auto: boolean
  status: string
  alarm: boolean
  uptime: number
  manualMaxSec?: number
  hardCapSec?: number
  soilEmergency?: number | null
  pumpMs?: number | null
  emergencyMs?: number | null
  soakWait?: number | null
  hotC?: number | null
  humidSkip?: number | null
  apSsid?: string | null
  version?: string | null
}

export type Actuator = Attribution & {
  id: number
  key: string
  label: string
  kind: ActuatorKind
  state: ActuatorState
  on_until: string | null
  max_run_s: number
  state_changed_at: string | null
  durations: number[] | null
}

export type Device = Attribution & {
  id: number
  name: string
  plot_id: number | null
  plot_name: string | null
  firmware: string
  ip: string
  rssi: number | null
  online: boolean
  last_seen: string | null
  token_hint: string
  created_at: string
  connection: DeviceConnection
  base_url: string | null
  mode_auto: boolean | null
  status_text: string
  alarm: boolean
  data: DeviceBoardData | null
  actuators: Actuator[]
}

export type DeviceWithToken = Device & { token: string }
export type DeviceCreated =
  | (Device & { connection: 'local'; token?: never })
  | (DeviceWithToken & { connection: 'push' })

export type DeviceCommand = Attribution & {
  id: number
  device_id: number
  actuator_id: number
  actuator: string
  action: DeviceCommandAction | 'auto' | 'manual'
  duration_s: number | null
  status: DeviceCommandStatus
  result: string
  created_by: string | null
  created_at: string
  delivered_at: string | null
  finished_at: string | null
}

export type DeviceWrite = {
  name: string
  plot_id: number | null
  connection?: DeviceConnection
  base_url?: string | null
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  )
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(t: string | null, remember = true): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    if (t) {
      const store = remember ? localStorage : sessionStorage
      store.setItem(TOKEN_KEY, t)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  role_label: 'Role',
  get title() { return t('common.title') },
  details: 'Details',
  worker_id: 'Worker',
  plot_id: 'Plot',
  status: 'Status',
  email: 'Email',
  password: 'Password',
  kind: 'Kind',
  capacity_l: 'Capacity',
  level_l: 'Level',
  refill_l_per_day: 'Refill per day',
  notes: 'Notes',
  soil_type: 'Soil type',
  crop: 'Crop',
  irrigation: 'Irrigation',
  area_m2: 'Area',
  species: 'Species',
  count: 'Count',
  get description() { return t('common.description') },
  litres_available: 'Volume',
  price_mode: 'Price',
  price_per_m3: 'Price per m³',
  water_source: 'Water source',
  quality_notes: 'Quality notes',
  fulfilment: 'Collection',
  delivery_radius_km: 'Delivery distance',
  available_from: 'Available from',
  available_until: 'Available until',
  governorate: 'Governorate',
  address_text: 'Address',
  lat: 'Latitude',
  lon: 'Longitude',
  photos: 'Photos',
  get message() { return t('common.message') },
  start_date: 'Start date',
  end_date: 'End date',
  pay_mode: 'Pay',
  pay_amount: 'Amount',
  pay_unit: 'Per',
  workers_needed: 'Workers needed',
  skills: 'Skills',
  get label() { return t('devices.label') },
  max_run_s: 'Longest run',
  duration_s: 'Duration',
  action: 'Action',
  base_url: 'Board address',
  connection: 'Connection',
  headline: 'Headline',
  bio: 'About me',
  visibility: 'Who can see your profile',
  radius_km: 'How far will you travel',
  looking_for_work: 'Looking for work',
  kinds: 'Kinds of work',
  languages: 'Languages',
  availability: 'Availability',
  account_type: 'Account type',
  reason: 'Reason',
  target_user_id: 'Person',
  admin_note: 'Note',
  engagement_id: 'Work',
  instruction: 'Correction',
  text: 'Text',
  data: 'File',
  current: 'CV',
}

function locField(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  for (let i = loc.length - 1; i >= 0; i--) {
    const p = loc[i]
    if (typeof p === 'string' && p !== 'body' && p !== 'query' && p !== 'path') return p
  }
  return ''
}

function fieldProblem(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (!Array.isArray(detail) || detail.length === 0) return ''
  const first = detail[0]
  if (!first || typeof first !== 'object') return ''
  const msg = 'msg' in first && typeof first.msg === 'string' ? first.msg : ''
  const field = locField('loc' in first ? first.loc : undefined)
  const label = field ? (FIELD_LABEL[field] ?? field.replace(/_/g, ' ')) : ''
  const lower = msg.toLowerCase()
  if (lower.includes('required') || lower.includes('missing')) {
    return label ? `${label} is required` : 'Please fill in the required fields'
  }
  if (label && msg) return `${label}: ${msg}`
  return msg
}

function englishDetail(status: number, detail: string): string {
  if (status === 401) return 'Wrong email or password.'
  if (status === 409) {
    const lower = detail.toLowerCase()
    if (lower.includes('email')) return 'That email is already in use.'
    if (lower.includes('contact')) return t('market.alreadyContacted')
    if (lower.includes('own listing') || lower.includes('your listing')) {
      return 'You cannot contact your own listing.'
    }
    if (lower.includes('own job') || lower.includes('your own job')) {
      return 'You cannot apply to your own job.'
    }
    if (lower.includes('already applied')) {
      return 'You already applied to this job.'
    }
    if (lower.includes('withdrew')) {
      return 'The applicant withdrew.'
    }
    const trimmed = detail.trim()
    if (trimmed && trimmed.length < 160 && !lower.includes('value error')) {
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
    }
    return 'That email is already in use.'
  }
  if (status === 403) {
    const lower = detail.toLowerCase()
    if (lower.includes('admin')) return 'Not allowed.'
    if (lower.includes('private')) {
      const trimmed = detail.trim()
      if (trimmed && trimmed.length < 160 && !lower.includes('value error')) {
        return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
      }
    }
    return 'Your role cannot do this on this farm.'
  }
  if (status === 404) return 'That item was not found.'
  if (status === 422) {
    const lower = detail.toLowerCase()
    if (lower.includes('password')) {
      return 'Password must be at least 8 characters.'
    }
    if (lower.includes('email')) return 'Please enter a valid email address.'
    const trimmed = detail.trim()
    if (trimmed && trimmed.length < 160 && !lower.includes('value error')) {
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
    }
    return 'Please check the form and try again.'
  }
  if (status === 429) {
    const trimmed = detail.trim()
    const lower = detail.toLowerCase()
    if (trimmed && trimmed.length < 160 && !lower.includes('value error')) {
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
    }
    return 'You have sent several reports today. Please wait before sending more.'
  }
  if (status === 413) {
    const trimmed = detail.trim()
    if (trimmed && trimmed.length < 160 && !trimmed.toLowerCase().includes('value error')) {
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
    }
    return t('market.photoSize')
  }
  if (status === 503) {
    const lower = detail.toLowerCase()
    if (lower.includes('ai helper') || lower.includes('switched on')) {
      const trimmed = detail.trim()
      if (trimmed && trimmed.length < 200 && !lower.includes('value error')) {
        return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
      }
      return 'The AI helper is not running right now.'
    }
    if (lower.includes('unreachable')) return 'The AI helper is unreachable right now.'
    if (lower.includes('could not answer') || lower.includes('no answer')) {
      return 'The AI helper could not answer.'
    }
    return 'Aqua is unavailable right now. Please try again.'
  }
  if (status === 502) {
    const lower = detail.toLowerCase()
    if (lower.includes('ai helper')) {
      const trimmed = detail.trim()
      if (trimmed && trimmed.length < 200 && !lower.includes('value error')) {
        return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
      }
    }
    if (lower.includes('pdf') || lower.includes('could not be made') || lower.includes('film') || lower.includes('video')) {
      const trimmed = detail.trim()
      if (trimmed && trimmed.length < 400 && !lower.includes('value error')) {
        return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
      }
    }
    return 'Aqua is unavailable right now. Please try again.'
  }
  if (status >= 500) return 'Aqua is unavailable right now. Please try again.'
  if (status === 0) return 'Could not reach Aqua. Check your connection.'
  return t('common.tryLater')
}

async function readError(r: Response, deviceAction = false): Promise<string> {
  try {
    const body: unknown = await r.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const d = (body as { detail: unknown }).detail
      if (deviceAction && typeof d === 'string' && [409, 502, 503].includes(r.status)) return d
      const problem = fieldProblem(d)
      if (problem) return englishDetail(r.status, problem)
    }
  } catch {
    /* body was not JSON */
  }
  return englishDetail(r.status, '')
}

async function req<T>(path: string, init?: RequestInit, deviceAction = false): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const t = getToken()
  if (t) headers.set('Authorization', `Bearer ${t}`)
  let r: Response
  try {
    r = await fetch(API_BASE + path, { ...init, headers })
  } catch (e) {
    if (isAbortError(e) || init?.signal?.aborted) {
      throw e instanceof Error ? e : new DOMException('Aborted', 'AbortError')
    }
    throw new ApiError(0, englishDetail(0, ''))
  }
  if (r.status === 401 && t) {
    setToken(null)
    location.reload()
  }
  if (!r.ok) throw new ApiError(r.status, await readError(r, deviceAction))
  if (r.status === 204) return undefined as T
  return r.json() as Promise<T>
}

async function reqBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  const t = getToken()
  if (t) headers.set('Authorization', `Bearer ${t}`)
  let r: Response
  try {
    r = await fetch(API_BASE + path, { headers })
  } catch {
    throw new ApiError(0, englishDetail(0, ''))
  }
  if (r.status === 401 && t) {
    setToken(null)
    location.reload()
  }
  if (!r.ok) throw new ApiError(r.status, await readError(r))
  return r.blob()
}

export function canEditFarm(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export function canAddPlot(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

export function canDecide(role: string): boolean {
  return role === 'technician' || role === 'manager' || role === 'owner' || role === 'admin'
}

export function canManageWorkers(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

export function canAssignTasks(role: string): boolean {
  return role === 'technician' || role === 'manager' || role === 'owner' || role === 'admin'
}

export function canManageWater(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

export function canManageMarket(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

export function canManageJobs(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

export function canSetWaterLevel(role: string): boolean {
  return role === 'technician' || role === 'manager' || role === 'owner' || role === 'admin'
}

export function canManageDevices(role: string): boolean {
  return role === 'manager' || role === 'owner' || role === 'admin'
}

export function canControlDevices(role: string): boolean {
  return role === 'technician' || role === 'manager' || role === 'owner' || role === 'admin'
}

export function isAdminUser(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin'
}

type WorkerHomeWireProfile = Partial<WorkerHomeProfile> & {
  name?: string
  account_type?: AccountType
  governorate?: string
  farm_count?: number
  complete?: boolean
  visibility?: ProfileVisibility
}

type WorkerHomeWire = {
  account_type?: AccountType
  name?: string
  active_work?: Engagement[]
  past_work_count?: number
  applications?: Partial<WorkerHomeApplications>
  opportunities_nearby?: number | null
  unread_messages?: number
  profile?: WorkerHomeWireProfile
  has_farm?: boolean
}

function asAccountType(value: unknown): AccountType | null {
  return value === 'farmer' || value === 'worker' ? value : null
}

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeWorkerHome(raw: WorkerHomeWire): WorkerHome {
  const p = raw.profile ?? {}
  const accountType = asAccountType(raw.account_type) ?? asAccountType(p.account_type) ?? 'worker'
  const name = (raw.name ?? p.name ?? '').trim()
  const apps = raw.applications ?? {}
  const pending = asCount(apps.pending)
  const accepted = asCount(apps.accepted)
  const declined = asCount(apps.declined)
  const total = asCount(apps.total) ?? (pending != null && accepted != null && declined != null ? pending + accepted + declined : null)
  const nearby = raw.opportunities_nearby
  return {
    account_type: accountType,
    name,
    active_work: Array.isArray(raw.active_work) ? raw.active_work : [],
    past_work_count: asCount(raw.past_work_count),
    applications: { pending, accepted, declined, total },
    opportunities_nearby: typeof nearby === 'number' && Number.isFinite(nearby) ? nearby : null,
    unread_messages: asCount(raw.unread_messages),
    profile: {
      demo: p.demo,
      entered_by: p.entered_by,
      updated_by: p.updated_by,
      complete: Boolean(p.complete),
      has_location: p.has_location ?? Boolean((p.governorate ?? '').trim()),
      visibility: p.visibility === 'private' ? 'private' : 'public',
      has_cv: Boolean(p.has_cv),
    },
    has_farm: Boolean(raw.has_farm ?? (p.farm_count ?? 0) > 0),
  }
}

export const api = {
  login: (email: string, password: string) =>
    req<{ access_token: string; token_type: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name: string, accountType: AccountType) =>
    req<User & { access_token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, account_type: accountType }),
    }),
  me: () => req<User>('/api/auth/me'),
  setAccountPhoto: (data: string) =>
    req<{ photo: string | null }>('/api/me/photo', {
      method: 'PUT',
      body: JSON.stringify({ data }),
    }),
  setAccountType: (accountType: AccountType) =>
    req<AccountSwitch>('/api/account/type', {
      method: 'PUT',
      body: JSON.stringify({ account_type: accountType }),
    }),
  workerHome: async () => {
    const raw = await req<WorkerHomeWire>('/api/home/worker')
    const home = normalizeWorkerHome(raw)
    if (typeof raw.profile?.has_cv === 'boolean') return home
    try {
      const cv = await req<MyCv>('/api/cv/me')
      return { ...home, profile: { ...home.profile, has_cv: cv.cv != null } }
    } catch {
      return home
    }
  },
  myCv: () => req<MyCv>('/api/cv/me'),
  saveCv: (data: CvData, source: CvSource) =>
    req<MyCv>('/api/cv/me', {
      method: 'PUT',
      body: JSON.stringify({ data, source }),
    }),
  uploadCvFile: (name: string, data: string) =>
    req<CvFileInfo>('/api/cv/me/file', {
      method: 'POST',
      body: JSON.stringify({ name, data }),
    }),
  cvFile: () => reqBlob('/api/cv/me/file'),
  deleteCvFile: () => req<void>('/api/cv/me/file', { method: 'DELETE' }),
  parseCv: (text?: string, signal?: AbortSignal) =>
    req<CvProposal>('/api/cv/me/parse', {
      method: 'POST',
      body: JSON.stringify(text ? { text } : {}),
      signal,
    }),
  describeCv: (text: string, signal?: AbortSignal) =>
    req<CvProposal>('/api/cv/me/describe', {
      method: 'POST',
      body: JSON.stringify({ text }),
      signal,
    }),
  refineCv: (current: CvData, instruction: string, signal?: AbortSignal) =>
    req<CvProposal>('/api/cv/me/refine', {
      method: 'POST',
      body: JSON.stringify({ current, instruction }),
      signal,
    }),
  applyCvToProfile: () =>
    req<CvApplyResult>('/api/cv/me/apply-to-profile', { method: 'POST' }),
  profileMe: () => req<MyProfile>('/api/profile/me'),
  updateProfile: (body: ProfileBody) =>
    req<MyProfile>('/api/profile/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  publicProfile: (userId: number) => req<PublicProfile>(`/api/profiles/${userId}`),
  members: (farmId?: number | null) => {
    const q = farmId != null ? `?farm_id=${farmId}` : ''
    return req<MembersPage>(`/api/members${q}`)
  },
  publicCv: (userId: number) => req<PublicCv>(`/api/cv/${userId}`),
  farms: () => req<Farm[]>('/api/farms'),
  farm: (id: number) => req<Farm>(`/api/farms/${id}`),
  createFarm: (body: { name: string; region: string; lat: number; lon: number }) =>
    req<Farm>('/api/farms', { method: 'POST', body: JSON.stringify(body) }),
  parseSketch: (body: { image?: string; description?: string; area_m2?: number }) =>
    req<SketchRead>('/api/onboarding/parse-sketch', { method: 'POST', body: JSON.stringify(body) }),
  onboardFarmer: (body: OnboardingFarmerBody) =>
    req<OnboardingFarmerResult>('/api/onboarding/farmer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateFarmAbout: (farmId: number, description: string) =>
    req<FarmAbout>(`/api/farms/${farmId}/about`, {
      method: 'PUT',
      body: JSON.stringify({ description }),
    }),
  uploadFarmSketch: (farmId: number, data: string) =>
    req<{ has_sketch: true }>(`/api/farms/${farmId}/sketch`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),
  farmSketch: (farmId: number) => reqBlob(`/api/farms/${farmId}/sketch`),
  deleteFarmSketch: (farmId: number) =>
    req<void>(`/api/farms/${farmId}/sketch`, { method: 'DELETE' }),
  aiStatus: () => req<AiStatus>('/api/ai/status'),
  suggestOnboarding: (body: { description?: string; image?: string }) =>
    req<OnboardingSuggest>('/api/onboarding/suggest', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createPlot: (farmId: number, body: PlotWrite) =>
    req<FarmPlot>(`/api/farms/${farmId}/plots`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePlot: (plotId: number, body: PlotWrite) =>
    req<FarmPlot>(`/api/plots/${plotId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  crops: () => req<Crop[]>('/api/crops'),
  overview: (farmId: number, signal?: AbortSignal) =>
    req<Overview>(`/api/farms/${farmId}/overview`, { signal }),
  plotReadings: (plotId: number, signal?: AbortSignal) =>
    req<PlotReading[]>(`/api/plots/${plotId}/readings?limit=1000`, { signal }),
  decide: (plotId: number) =>
    req<DecisionResult>(`/api/plots/${plotId}/decide`, { method: 'POST' }),
  workerChat: (messages: ChatMessage[], attachments: ChatAttachment[]) =>
    req<ChatReply>('/api/me/chat', { method: 'POST', body: JSON.stringify({ messages, attachments }) }),
  runChange: (r: ProposedChange['request']) =>
    req<unknown>(r.path, { method: r.method, ...(r.body ? { body: JSON.stringify(r.body) } : {}) }),
  chat: (farmId: number, messages: ChatMessage[], attachments: ChatAttachment[]) =>
    req<ChatReply>(`/api/farms/${farmId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages, attachments }),
    }),
  workers: (farmId: number) => req<Worker[]>(`/api/farms/${farmId}/workers`),
  createWorker: (farmId: number, body: { name: string; role_label: string }) =>
    req<Worker>(`/api/farms/${farmId}/workers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteWorker: (farmId: number, id: number) =>
    req<void>(`/api/farms/${farmId}/workers/${id}`, { method: 'DELETE' }),
  tasks: (farmId: number) => req<Task[]>(`/api/farms/${farmId}/tasks`),
  createTask: (
    farmId: number,
    body: { worker_id: number; plot_id: number | null; title: string; details: string },
  ) =>
    req<Task>(`/api/farms/${farmId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeTask: (farmId: number, id: number) =>
    req<Task>(`/api/farms/${farmId}/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    }),
  waterSources: (farmId: number, signal?: AbortSignal) =>
    req<{ sources: WaterSource[]; summary: WaterSummary }>(
      `/api/farms/${farmId}/water-sources`,
      { signal },
    ),
  createWaterSource: (farmId: number, body: WaterSourceBody) =>
    req<WaterSource>(`/api/farms/${farmId}/water-sources`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateWaterSource: (farmId: number, id: number, body: WaterSourceBody) =>
    req<WaterSource>(`/api/farms/${farmId}/water-sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setWaterLevel: (farmId: number, id: number, level_l: number) =>
    req<WaterSource>(`/api/farms/${farmId}/water-sources/${id}/level`, {
      method: 'PUT',
      body: JSON.stringify({ level_l }),
    }),
  deleteWaterSource: (farmId: number, id: number) =>
    req<void>(`/api/farms/${farmId}/water-sources/${id}`, { method: 'DELETE' }),
  livestock: (farmId: number) => req<LivestockList>(`/api/farms/${farmId}/livestock`),
  farmAnimals: (farmId: number) => req<FarmAnimals>(`/api/farms/${farmId}/animals`),
  createLivestock: (farmId: number, body: { species: string; count: number; place?: string }) =>
    req<LivestockHerd>(`/api/farms/${farmId}/livestock`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateLivestock: (farmId: number, id: number, body: { count: number; place?: string }) =>
    req<LivestockHerd>(`/api/farms/${farmId}/livestock/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteLivestock: (farmId: number, id: number) =>
    req<void>(`/api/farms/${farmId}/livestock/${id}`, { method: 'DELETE' }),
  soilCatalog: (signal?: AbortSignal) => req<{ soils: SoilCard[] }>('/api/soils', { signal }),
  farmSoil: (farmId: number, signal?: AbortSignal) =>
    req<FarmSoil>(`/api/farms/${farmId}/soil`, { signal }),
  setFarmSoil: (farmId: number, body: { soil_key: string; description?: string }) =>
    req<FarmSoil>(`/api/farms/${farmId}/soil`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  clearFarmSoil: (farmId: number) =>
    req<void>(`/api/farms/${farmId}/soil`, { method: 'DELETE' }),
  farmActivity: (farmId: number, days = 7, signal?: AbortSignal) =>
    req<ActivityLog>(`/api/farms/${farmId}/activity?days=${days}`, { signal }),
  addFarmActivity: (
    farmId: number,
    body: { kind: Exclude<ActivityKind, 'people'>; title: string; detail?: string; plot_id?: number | null },
  ) =>
    req<ActivityItem>(`/api/farms/${farmId}/activity`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteFarmActivity: (farmId: number, noteId: number) =>
    req<void>(`/api/farms/${farmId}/activity/${noteId}`, { method: 'DELETE' }),
  farmReports: (farmId: number, signal?: AbortSignal) =>
    req<{ reports: WeeklyReportMeta[] }>(`/api/farms/${farmId}/reports`, { signal }),
  makeWeeklyReport: (farmId: number, week?: string) =>
    req<WeeklyReportMeta>(`/api/farms/${farmId}/reports/weekly`, {
      method: 'POST',
      body: JSON.stringify(week ? { week } : {}),
    }),
  farmReportPdf: (farmId: number, reportId: number) =>
    reqBlob(`/api/farms/${farmId}/reports/${reportId}/pdf`),
  farmVideos: (farmId: number, signal?: AbortSignal) =>
    req<{ videos: FarmVideo[] }>(`/api/farms/${farmId}/videos`, { signal }),
  farmVideo: (farmId: number, videoId: number, signal?: AbortSignal) =>
    req<FarmVideo>(`/api/farms/${farmId}/videos/${videoId}`, { signal }),
  makeFarmVideo: (farmId: number, week?: string) =>
    req<FarmVideo>(`/api/farms/${farmId}/videos`, {
      method: 'POST',
      body: JSON.stringify(week ? { week } : {}),
    }),
  farmVideoFile: (farmId: number, videoId: number) =>
    reqBlob(`/api/farms/${farmId}/videos/${videoId}/file`),
  waterBalance: (farmId: number) => req<WaterBalance>(`/api/farms/${farmId}/water-balance`),
  forecast: (farmId: number, signal?: AbortSignal) => req<Forecast>(`/api/farms/${farmId}/forecast`, { signal }),
  marketMeta: () => req<MarketMeta>('/api/market/meta'),
  marketListings: (query: MarketListingsQuery) => {
    const q = new URLSearchParams()
    if (query.q) q.set('q', query.q)
    if (query.governorate) q.set('governorate', query.governorate)
    if (query.fulfilment) q.set('fulfilment', query.fulfilment)
    if (query.source) q.set('source', query.source)
    if (query.max_price != null) q.set('max_price', String(query.max_price))
    if (query.min_litres != null) q.set('min_litres', String(query.min_litres))
    if (query.sort) q.set('sort', query.sort)
    if (query.near_farm_id != null) q.set('near_farm_id', String(query.near_farm_id))
    q.set('limit', String(query.limit ?? 24))
    q.set('offset', String(query.offset ?? 0))
    return req<MarketListingsPage>(`/api/market/listings?${q.toString()}`)
  },
  marketListing: (id: number, nearFarmId?: number) => {
    const q =
      nearFarmId != null ? `?near_farm_id=${encodeURIComponent(String(nearFarmId))}` : ''
    return req<MarketListing>(`/api/market/listings/${id}${q}`)
  },
  sendMarketInquiry: (id: number, message: string) =>
    req<MarketInquiry>(`/api/market/listings/${id}/inquiries`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  myMarketInquiries: () => req<MarketInquiry[]>('/api/market/my-inquiries'),
  farmMarketListings: (farmId: number) =>
    req<MarketListing[]>(`/api/farms/${farmId}/market/listings`),
  createMarketListing: (farmId: number, body: MarketListingBody) =>
    req<MarketListing>(`/api/farms/${farmId}/market/listings`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMarketListing: (farmId: number, id: number, body: MarketListingBody) =>
    req<MarketListing>(`/api/farms/${farmId}/market/listings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMarketListing: (farmId: number, id: number) =>
    req<void>(`/api/farms/${farmId}/market/listings/${id}`, { method: 'DELETE' }),
  uploadMarketPhoto: (farmId: number, data: string) =>
    req<MarketPhoto>(`/api/farms/${farmId}/market/photos`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),
  farmMarketInquiries: (farmId: number) =>
    req<MarketInquiry[]>(`/api/farms/${farmId}/market/inquiries`),
  updateMarketInquiry: (id: number, status: Exclude<MarketInquiryStatus, 'new'>) =>
    req<MarketInquiry>(`/api/market/inquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  jobs: (query: JobsQuery) => {
    const q = new URLSearchParams()
    if (query.q) q.set('q', query.q)
    if (query.kind) q.set('kind', query.kind)
    if (query.governorate) q.set('governorate', query.governorate)
    if (query.sort) q.set('sort', query.sort)
    if (query.near_farm_id != null) q.set('near_farm_id', String(query.near_farm_id))
    q.set('limit', String(query.limit ?? 24))
    q.set('offset', String(query.offset ?? 0))
    return req<JobsPage>(`/api/jobs?${q.toString()}`)
  },
  job: (id: number, nearFarmId?: number) => {
    const q =
      nearFarmId != null ? `?near_farm_id=${encodeURIComponent(String(nearFarmId))}` : ''
    return req<Job>(`/api/jobs/${id}${q}`)
  },
  applyToJob: (id: number, message: string) =>
    req<JobApplication>(`/api/jobs/${id}/applications`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  myJobApplications: () => req<JobApplication[]>('/api/jobs/my-applications'),
  withdrawJobApplication: (id: number) =>
    req<void>(`/api/jobs/applications/${id}`, { method: 'DELETE' }),
  opportunities: (query: OpportunitiesQuery) => {
    const q = new URLSearchParams()
    if (query.radius_km != null) q.set('radius_km', String(query.radius_km))
    if (query.kinds && query.kinds.length > 0) q.set('kinds', query.kinds.join(','))
    if (query.skills && query.skills.length > 0) q.set('skills', query.skills.join(','))
    if (query.q) q.set('q', query.q)
    q.set('limit', String(query.limit ?? 24))
    q.set('offset', String(query.offset ?? 0))
    return req<OpportunitiesPage>(`/api/opportunities?${q.toString()}`)
  },
  farmCandidates: (farmId: number, query: CandidatesQuery) => {
    const q = new URLSearchParams()
    if (query.radius_km != null) q.set('radius_km', String(query.radius_km))
    if (query.job_id != null) q.set('job_id', String(query.job_id))
    if (query.kinds && query.kinds.length > 0) q.set('kinds', query.kinds.join(','))
    if (query.skills && query.skills.length > 0) q.set('skills', query.skills.join(','))
    if (query.q) q.set('q', query.q)
    q.set('limit', String(query.limit ?? 24))
    q.set('offset', String(query.offset ?? 0))
    return req<CandidatesPage>(`/api/farms/${farmId}/candidates?${q.toString()}`)
  },
  farmJobs: (farmId: number) => req<Job[]>(`/api/farms/${farmId}/jobs`),
  inviteWorker: (farmId: number, jobId: number, body: { user_id: number; message: string }) =>
    req<JobOffer>(`/api/farms/${farmId}/jobs/${jobId}/offers`, { method: 'POST', body: JSON.stringify(body) }),
  farmJobOffers: (farmId: number) => req<JobOffer[]>(`/api/farms/${farmId}/jobs/offers`),
  withdrawJobOffer: (farmId: number, offerId: number) =>
    req<void>(`/api/farms/${farmId}/jobs/offers/${offerId}`, { method: 'DELETE' }),
  myJobOffers: () => req<JobOffer[]>('/api/jobs/my-offers'),
  answerJobOffer: (offerId: number, status: 'accepted' | 'declined') =>
    req<JobOffer>(`/api/jobs/offers/${offerId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  createFarmJob: (farmId: number, body: JobBody) =>
    req<Job>(`/api/farms/${farmId}/jobs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateFarmJob: (farmId: number, id: number, body: JobBody) =>
    req<Job>(`/api/farms/${farmId}/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteFarmJob: (farmId: number, id: number) =>
    req<void>(`/api/farms/${farmId}/jobs/${id}`, { method: 'DELETE' }),
  farmJobApplications: (farmId: number) =>
    req<JobApplication[]>(`/api/farms/${farmId}/jobs/applications`),
  updateJobApplication: (id: number, status: 'accepted' | 'declined') =>
    req<JobApplication>(`/api/jobs/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  farmEngagements: (farmId: number, status?: EngagementStatus) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    return req<Engagement[]>(`/api/farms/${farmId}/engagements${q}`)
  },
  myEngagements: () => req<Engagement[]>('/api/engagements/mine'),
  finishEngagement: (id: number, note?: string) =>
    req<Engagement>(`/api/engagements/${id}/finish`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
  disapproveEngagement: (id: number, reason: string) =>
    req<Engagement>(`/api/engagements/${id}/disapprove`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  upgradeEngagement: (id: number) =>
    req<Engagement>(`/api/engagements/${id}/upgrade`, { method: 'POST' }),
  messageThreads: () => req<MessageThread[]>('/api/messages/threads'),
  messagesUnread: () => req<MessagesUnread>('/api/messages/unread'),
  engagementMessages: (id: number) =>
    req<EngagementMessage[]>(`/api/engagements/${id}/messages`),
  sendEngagementMessage: (id: number, body: string) =>
    req<EngagementMessage>(`/api/engagements/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  createReport: (body: ReportBody) =>
    req<Report>('/api/reports', { method: 'POST', body: JSON.stringify(body) }),
  myReports: () => req<Report[]>('/api/reports/mine'),
  adminReports: (status?: ReportStatus) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : ''
    return req<AdminReport[]>(`/api/admin/reports${q}`)
  },
  patchAdminReport: (id: number, body: AdminReportPatch) =>
    req<AdminReport>(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  boardAddress: (farmId: number) => req<{ url: string | null }>(`/api/farms/${farmId}/board-address`),
  devices: (farmId: number, live = false) => req<Device[]>(`/api/farms/${farmId}/devices${live ? '?live=true' : ''}`),
  createDevice: (farmId: number, body: DeviceWrite) =>
    req<DeviceCreated>(`/api/farms/${farmId}/devices`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateDevice: (farmId: number, id: number, body: DeviceWrite) =>
    req<Device>(`/api/farms/${farmId}/devices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setDeviceMode: (farmId: number, id: number, auto: boolean) =>
    req<Device & { message: string }>(`/api/farms/${farmId}/devices/${id}/mode`, {
      method: 'POST',
      body: JSON.stringify({ auto }),
    }, true),
  rotateDeviceToken: (farmId: number, id: number) =>
    req<DeviceWithToken>(`/api/farms/${farmId}/devices/${id}/rotate-token`, {
      method: 'POST',
    }),
  deleteDevice: (farmId: number, id: number) =>
    req<void>(`/api/farms/${farmId}/devices/${id}`, { method: 'DELETE' }),
  updateActuator: (
    farmId: number,
    deviceId: number,
    actuatorId: number,
    body: { label: string; max_run_s: number },
  ) =>
    req<Actuator>(`/api/farms/${farmId}/devices/${deviceId}/actuators/${actuatorId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  commandActuator: (
    farmId: number,
    deviceId: number,
    actuatorId: number,
    body: { action: DeviceCommandAction; duration_s?: number },
  ) =>
    req<DeviceCommand>(
      `/api/farms/${farmId}/devices/${deviceId}/actuators/${actuatorId}/command`,
      { method: 'POST', body: JSON.stringify(body) },
      true,
    ),
  stopAllDevices: (farmId: number) =>
    req<{ stopping: number }>(`/api/farms/${farmId}/devices/stop-all`, { method: 'POST' }, true),
  deviceCommands: (farmId: number, id: number) =>
    req<DeviceCommand[]>(`/api/farms/${farmId}/devices/${id}/commands`),
}
