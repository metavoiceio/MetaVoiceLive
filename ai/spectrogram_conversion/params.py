## Audio
sample_rate = 22050

## Mel-filterbank
n_fft = 2048
num_mels = 80
num_samples = 128  # input spect shape num_mels * num_samples
hop_length = 256  # int(0.0125 * sample_rate)  # 12.5ms - in line with Tacotron 2 paper
win_length = 1024  # int(0.05 * sample_rate)  # 50ms - same reason as above
fmin = 0
fmax = 8000

# corresponds to 1.486s of audio, or 32768 samples in the time domain. This is the number of samples
# fed into the VC module
MAX_INFER_SAMPLES_VC = num_samples * hop_length

## Vocoder
VOCODER_FUTURE_CONTEXT_SPEC_FRAMES = 16 * 2

SEED = 1234  # numpy & torch PRNG seed
