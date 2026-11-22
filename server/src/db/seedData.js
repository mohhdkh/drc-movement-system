const INITIAL_TIMESTAMP = '2026-01-01T00:00:00.000Z'

const departments = [
  { id: 'dep-programs', name: 'Programs', active: true },
  { id: 'dep-safety', name: 'Safety', active: true },
  { id: 'dep-operations', name: 'Operations', active: true },
  { id: 'dep-support', name: 'Support Services', active: true },
  { id: 'dep-supply-chain', name: 'Supply Chain', active: true },
]

const users = [
  { id: 'emp-001', name: 'Ahmed Thabet', email: 'ahmed.thabet@drc.example', phone: '0592636501', departmentId: 'dep-programs', roles: ['EMPLOYEE'], active: true },
  { id: 'emp-002', name: 'Huda Almahdi', email: 'huda.almahdi@drc.example', phone: '0595259360', departmentId: 'dep-safety', roles: ['EMPLOYEE', 'SAFETY', 'ADMIN'], active: true },
  { id: 'emp-003', name: "Samer Manna'a", email: 'samer.mannaa@drc.example', phone: '0562998849', departmentId: 'dep-programs', roles: ['EMPLOYEE'], active: true },
  { id: 'emp-004', name: 'Abed AL Rhaman Mousa', email: 'abed.mousa@drc.example', phone: '0592255129', departmentId: 'dep-operations', roles: ['EMPLOYEE', 'AREA_MANAGER'], active: true },
  { id: 'emp-005', name: 'Dema Al Madhoun', email: 'dema.almadhoun@drc.example', phone: '0597791602', departmentId: 'dep-support', roles: ['EMPLOYEE'], active: true },
  { id: 'emp-006', name: 'Hani Jouda', email: 'hani.jouda@drc.example', phone: '970597555735', departmentId: 'dep-supply-chain', roles: ['EMPLOYEE', 'SUPPLY_CHAIN'], active: true },
]

const passengerDirectory = [
  ['Charles du Crest', '970 562998831'],
  ['Mahmoud Sursour', '970 562998840'],
  ['Haya Al HAJ', '970 562998836'],
  ['Heba abu Dwaba', '970 562998834'],
  ['Maha hammad', '970 562998837'],
  ['Mahmoud alokor', '970 562998838'],
  ['Rana Suroji', '970 562998833'],
  ['Mohammed Al Saloul', '0599445587'],
  ['Ahmad Mansour', '970 566020391'],
  ['Alaa Omari', '0598391859'],
  ['Hani Jouda', '970 562998848'],
  ['Nidaa (PARC)', null],
  ['Mohammed Al Sabea', '970 598891920'],
  ['Ola Abu Hasaballah', '972592126170'],
  ['Iktemal Aila', '0592742344'],
  ['Sonia Rahal (RI)', null],
  ['Yahya Kullab', '+972562998854'],
  ['Nick Vovk', null],
  ['Zozo alsharif (DW)', '+972597489741'],
  ['Ahmed Khattab', '+970562998835'],
  ['Helene Daniel', '+970562998830'],
  ['Mohammad Al-Shair', '+970595373985'],
  ['Alaa AL Shafee', '+970562998841'],
  ['haytham abu zaid', '0597119927'],
  ['Eman Abo Abdo', '+972592169697'],
  ['AlaaAldien Shannan', '594955552'],
  ['Belal Abu Limon', '592761321'],
  ['Dema Ramdan', '0599465357'],
  ['Mohammed abdou houssine', null],
  ['Alaa khail', '0595566753'],
  ['Talat al Ghaffari', '0597652066'],
  ['Bader Bader', '0562998873'],
  ['Shrouq Abu Eida', '0592474964'],
  ['Manar Al shaer', '0562998838'],
  ['Ali Al Ryaty', '0594281274'],
  ['Alessia Gia', '0593572047'],
  ['Basel Shaheen', '0562998850'],
  ['Mahmoud El-Mahallawi', '0592535224'],
  ['Amal Abo Saif', '0599756337'],
  ['Bisan Abu Harb', '0562998845'],
  ['Basel Al Shafee', '0597172639'],
  ['Salma Al Taweel', '0598923665'],
  ['Nagem Al Zain', '0598865161'],
  ['Osama Abu Lila', '0597230320'],
  ['Eyad Mayet', '0597252867'],
  ['Mohammed Thabet', null],
  ['Ahmed Hajaj', '0598424776'],
  ['Ahmed Al Daour', '0598830145'],
  ['Khaled Nabhan', '0595885120'],
  ['Farah Armana', '0597273626'],
  ['Mohammed Kuhail', '0567773653'],
  ['Mohammed Al-Baz', null],
  ['Khalil Shaheen', null],
  ['Salah Musallam', null],
  ['Abd Al-Hai Abd Al-Jawad', null],
  ['Rami Al Haila', null],
].map(([name, phone], index) => ({
  id: `emp-${String(index + 7).padStart(3, '0')}`,
  name,
  email: null,
  phone,
  departmentId: null,
  roles: ['EMPLOYEE'],
  active: true,
}))

users.push(...passengerDirectory)

const vehicles = [
  { id: 'veh-001', code: 'DRC001', plateNumber: 'DRC-001', model: 'Toyota Land Cruiser', active: true },
  { id: 'veh-002', code: 'DRC007', plateNumber: 'DRC-007', model: 'Toyota Hilux', active: true },
  { id: 'veh-003', code: 'DRC108', plateNumber: 'DRC-108', model: 'SUV', active: true },
  { id: 'veh-004', code: 'DRC999', plateNumber: 'DRC-999', model: 'Inactive vehicle', active: false },
]

const drivers = [
  { id: 'drv-001', name: 'Bassam Raed Bassam Tafesh', phone: '+972593496000', active: true },
  { id: 'drv-002', name: 'Saleem Qasem Ameen Badawi', phone: '592649649', active: true },
  { id: 'drv-003', name: 'Rami', phone: null, active: true },
  { id: 'drv-004', name: 'Inactive Driver', phone: null, active: false },
]

const gpsDevices = [
  { id: 'gps-001', code: 'GPS-01', label: 'Garmin GPS 01', active: true },
  { id: 'gps-002', code: 'GPS-02', label: 'Garmin GPS 02', active: true },
  { id: 'gps-003', code: 'GPS-03', label: 'Garmin GPS 03', active: false },
]

const locations = [
  { id: 'loc-office-gaza', name: 'DRC Office Gaza', latitude: 31.5017, longitude: 34.4668, active: true },
  { id: 'loc-community-center', name: 'Community Center', latitude: null, longitude: null, active: true },
]

function timestamped(items) {
  return items.map((item) => ({ ...item, createdAt: INITIAL_TIMESTAMP, updatedAt: INITIAL_TIMESTAMP }))
}

module.exports = {
  INITIAL_TIMESTAMP,
  departments: timestamped(departments),
  drivers: timestamped(drivers),
  gpsDevices: timestamped(gpsDevices),
  locations: timestamped(locations),
  users: timestamped(users).map((user) => ({
    ...user,
    entraObjectId: null,
    entraTenantId: null,
    entraPrincipalName: null,
  })),
  vehicles: timestamped(vehicles),
}
