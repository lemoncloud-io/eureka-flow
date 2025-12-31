import axios from 'axios';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _env = (): { [key: string]: string | undefined } => {
    if (typeof window !== 'undefined' && (window as any)) {
        return (window as any);
    }
    if (typeof process !== 'undefined' && process.env) {
        return process.env;
    }
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env;
    }
    return {};
};

const $env = _env();
export const API_URL = $env?.API_URL || $env?.VITE_API_URL || 'http://localhost:8000';
console.log('API Base URL:', API_URL);
export const API_TOKEN = $env?.API_TOKEN || $env?.VITE_API_TOKEN || '';

// Axios 인스턴스 생성
const apiClient = axios.create({
    baseURL: API_URL, // 기본 URL 설정
    headers: {
        'Content-Type': 'application/json',
        // 여기에 Authorization 헤더 등을 추가할 수 있습니다.
        'Authorization': API_TOKEN ? `Bearer ${API_TOKEN}` : undefined,
    },
    timeout: 35000, // 요청 타임아웃 설정 (35초)
});

// 요청 인터셉터: 모든 요청이 보내지기 전에 실행됩니다.
apiClient.interceptors.request.use(
    config => {
        // 요청 전에 로컬 스토리지에서 토큰을 가져와 헤더에 추가하는 등의 작업을 할 수 있습니다.
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    },
);

export default apiClient;
