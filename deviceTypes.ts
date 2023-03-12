export interface StreamDev {
    dts: number;
    sts: number;
    wts: number;
    rts: number;
    seq: number;
    lng: number;
    lat: number;
    alt: number;
    h3r15: string;
    state: string;
}

export interface StreamDevLocationUpdate {
    deviceId: string;
    dts: number;
    seq: number;
    lng: number;
    lat: number;
    alt: number;
    h3r15: string;
    state: string;
}
