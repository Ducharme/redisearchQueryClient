// Based on https://github.com/Ducharme/mockIotGpsDeviceAwsSdkV2/blob/main/device.ts

const MaxLatitude = 90;
const MinLatitude = -MaxLatitude;
const MaxLongitude = 180;
const MinLongitude = -MaxLongitude;
const WrapLongitude = MaxLongitude * 2;
const WrapLatitude = MaxLatitude * 2;


// Math.random() function returns a floating-point, pseudo-random number 
// in the range 0 to less than 1 (inclusive of 0, but not 1) with 
// approximately uniform distribution over that range
const RandomNumbers = [Math.random()-0.5,
    Math.random()-0.5, Math.random()-0.5, Math.random()-0.5,
    Math.random()-0.5, Math.random()-0.5, Math.random()-0.5,
    Math.random()-0.5, Math.random()-0.5, Math.random()-0.5];


class Device {
    latitude = 45.508888;
    longitude = -73.561668;
    altitude = 12.34;
    battery = 100;
    deviceId = "test-00";
	  firmwareVersion = "0.0.1";
    dev_ts = Date.now() - 500;
    srv_ts = this.dev_ts + 200;
    wrk_ts = this.srv_ts + 200;
    seq = -1;
    randomIndex = 0;

    constructor(index) {
      this.deviceId += index.toString();
    }

    Move(latitudeDelta, longitudeDelta, altitudeDelta) {
        var newLatitude = this.latitude + latitudeDelta;
        if (newLatitude > MaxLatitude) {
            newLatitude -= WrapLatitude;
        } else if (newLatitude < MinLatitude) {
            newLatitude += WrapLatitude;
        }
        
        var newLongitude = this.longitude + longitudeDelta;
        if (newLongitude > MaxLongitude) {
            newLongitude -= WrapLongitude;
        } else if (newLongitude < MinLongitude) {
            newLongitude += WrapLongitude;
        }

        var newAltitude = this.altitude + altitudeDelta;
        if (newAltitude < 0) {
            newAltitude = 0.0;
        }
        
        this.latitude = newLatitude;
        this.longitude = newLongitude;
        this.altitude = newAltitude;
        this.dev_ts = Date.now() - 500;
        this.srv_ts = this.dev_ts + 200;
        this.wrk_ts = this.srv_ts + 200;
        this.seq = this.seq + 1;
    }

    GetNextRandom() {
        var random = RandomNumbers[this.randomIndex++];
        if (this.randomIndex === RandomNumbers.length) {
            this.randomIndex = 0;
        }
        return random;
    }

    MoveRandomly() {
        var latDelta = this.GetNextRandom();
        var lonDelta = this.GetNextRandom();
        var altDelta = this.GetNextRandom();
        this.Move(latDelta, lonDelta, altDelta);
    }

    get getLocation() {
        return this.location;
    }

    get getProperties() {
        return this.properties;
    }

    get getBatteryLevel() {
        return this.battery;
    }
}

module.exports = {Device}
