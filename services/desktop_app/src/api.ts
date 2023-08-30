import { baseSpeakers } from './constants';

export async function getSpeakers() {
    // might fetch from supabase later
    const userSpeakers = await window.electronAPI.getUserSpeakers();

    return [
        ...userSpeakers,
        ...baseSpeakers,
    ]
}