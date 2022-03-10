const fs = require('fs').promises;
const TeslaAPI = require('tesla-api-request');
const HUE = require('node-hue-api').v3;

const sleep = async delay => new Promise(resolve => setTimeout(resolve, delay));

const CONFIG = require(`${__dirname}/config.json`);

const isGeofenced = (input, center, distance) => {
  const ky = 40000 / 360;
  const kx = Math.cos(Math.PI * center.latitude / 180.0) * ky;
  const dx = Math.abs(center.longitude - input.longitude) * kx;
  const dy = Math.abs(center.latitude - input.latitude) * ky;

  return Math.sqrt(dx * dx + dy * dy) <= distance;
};

let hue;

const run = async () => {
  hue = hue || await HUE.api.createLocal(CONFIG.HUE.HOST).connect(CONFIG.HUE.USER);

  for (const [name, vehicle] of Object.entries(CONFIG.VEHICLES)) {
    const api = new TeslaAPI({ token: CONFIG.REFRESH_TOKEN, vin: vehicle.VIN });
    const current = await api.get('vehicle_data');

    if (!current) {
      console.error(`Failed to refresh state for ${name}`);
      continue;
    }

    const dir = `${__dirname}/states/${name}`;
    const file = `${dir}/state.json`;

    await fs.mkdir(dir, { recursive: true });

    let previous;

    try {
      previous = require(file);
    }
    catch (ex) {}

    const wasHome = previous && isGeofenced(previous.drive_state, CONFIG.GEOFENCES.Home, 0.2);
    const isHome = isGeofenced(current.drive_state, CONFIG.GEOFENCES.Home, 0.2);
    
    await fs.writeFile(file, JSON.stringify(current, null, 2));

    if (!wasHome && isHome) {
      console.info(`${name} just arrived home! Switching light ${vehicle.HUE_LIGHT.ID} on.`);
      const previousState = await hue.lights.getLightState(vehicle.HUE_LIGHT.ID);
      await hue.lights.setLightState(vehicle.HUE_LIGHT.ID, vehicle.HUE_LIGHT.STATE);
      setTimeout(async () => {
        await hue.lights.setLightState(vehicle.HUE_LIGHT.ID, previousState);
      }, 10 * 60 * 1000);
    }
  }

  await sleep(15000);
  run();
};

run();
