import Avatars from '../assets/avatar-*.png';

export const SERVER_BASE_URL = 'http://127.0.0.1:58000';

export const baseSpeakers = [
    { id: 'zeus', name: 'Zeus', avatar: Avatars.zeus },
    { id: 'eva', name: 'Eva', avatar: Avatars.eva },
    { id: 'scarlett', name: 'Scarlett', avatar: Avatars.scarlett },
    { id: 'yara', name: 'Yara', avatar: Avatars.yara },
    { id: 'blake', name: 'Blake' },
]
export const getSpeakerById = (speakers, id) => speakers.find((speaker) => speaker.id === id);
