import axios from 'axios'
import store from "@/store/store"
import {updateRefreshTokenStatus} from "@/store/slice/refreshSlice";
import {checkAuthCookieExists, checkRefreshCookieExists} from "@/lib/utils/helpers/getCookie";
import {loadingBus} from "@/lib/utils/loadingBus";
import { toast } from "@/hooks/use-toast";

// --- Refresh token mutex ---
// Prevents concurrent refresh attempts and post-logout request loops
let isRefreshing = false;
let isLoggingOut = false;
let failedQueue: { resolve: (value?: unknown) => void; reject: (reason?: unknown) => void }[] = [];

const processQueue = (error: unknown | null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    failedQueue = [];
};

const clearClientCookies = () => {
    // Must match the Domain the server used when setting cookies
    // Server uses FE_DOMAIN (e.g., onecamp.onemana.dev)
    const cookieNames = ['Authorization', 'RefreshToken'];
    const hostname = window.location.hostname; // e.g., onecamp.onemana.dev
    const parts = hostname.split('.');
    const parentDomain = parts.length >= 2 ? '.' + parts.slice(-2).join('.') : '';

    // Clear with all possible domain variations
    const domains = ['', hostname, '.' + hostname, parentDomain];
    for (const name of cookieNames) {
        for (const domain of domains) {
            const domainPart = domain ? `; domain=${domain}` : '';
            document.cookie = `${name}=; Max-Age=0; path=/${domainPart}`;
        }
    }
};

const performLogout = async () => {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
        await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}logout`, {}, {
            withCredentials: true
        });
    } catch {
        // Logout call failed, still clear client state
    }
    clearClientCookies();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
};

const axiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
});

axiosInstance.interceptors.request.use(async req => {
    // Block all requests if we're in the middle of logging out
    if (isLoggingOut) {
        const controller = new AbortController();
        req.signal = controller.signal;
        controller.abort('FE: Logging out');
        return req;
    }

    loadingBus.start();
    const authExists = checkAuthCookieExists()
    const refreshTokenExist = checkRefreshCookieExists()

    if(authExists){
        return req
    }

    const controller = new AbortController();
    req.signal = controller.signal;

    if(!refreshTokenExist){
        controller.abort('FE: Not Authorised');
        performLogout();
        return req
    }

    // Use the same mutex for request-interceptor refresh
    if (isRefreshing) {
        // Wait for the in-flight refresh to complete
        return new Promise((resolve, reject) => {
            failedQueue.push({
                resolve: () => resolve(req),
                reject: () => {
                    controller.abort('FE: Not Authorised');
                    reject(new axios.Cancel('FE: Not Authorised'));
                }
            });
        });
    }

    isRefreshing = true;
    try {
        await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}refreshToken`, {
            withCredentials: true
        });
        store.dispatch(updateRefreshTokenStatus({exist: true}));
        processQueue(null);
    } catch(err) {
        processQueue(err);
        if (axios.isAxiosError(err) && err.response?.status === 401) {
            await performLogout();
        }
        controller.abort('FE: Not Authorised');
    } finally {
        isRefreshing = false;
    }

    return req
})

axiosInstance.interceptors.response.use(
    (response) => {
        loadingBus.end();
        return response;
    },
    async (error) => {
        loadingBus.end();
        const originalRequest = error.config;

        // Don't process anything if we're logging out
        if (isLoggingOut) {
            return Promise.reject(error);
        }

        // Standardized Error Toasting (excluding 401 refresh attempts)
        if (error.response && error.response.status !== 401) {
            toast({
                variant: "destructive",
                title: "In-App Error",
                description: error.response.data?.msg || error.message || "An unexpected error occurred",
            });
        }

        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            // Mark retry immediately to prevent duplicate refresh from this request
            originalRequest._retry = true;

            if (isRefreshing) {
                // Another request is already refreshing — queue this one
                return new Promise((resolve, reject) => {
                    failedQueue.push({
                        resolve: () => resolve(axiosInstance(originalRequest)),
                        reject: (err) => reject(err),
                    });
                });
            }

            isRefreshing = true;
            try {
                await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}refreshToken`, {
                    withCredentials: true
                });
                store.dispatch(updateRefreshTokenStatus({exist: true}));
                processQueue(null);
                return axiosInstance(originalRequest);
            }
            catch(err) {
                processQueue(err);
                if (axios.isAxiosError(err) && err.response?.status === 401) {
                    await performLogout();
                }
                return Promise.reject(err);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error)
    },
)

export default axiosInstance