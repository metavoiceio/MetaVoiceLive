include Makefile.variable

ROOT:=${shell pwd}
SOUNDFILE_DATA := ${SITE_PACKAGES}/_soundfile_data

BLACK_CONFIG=-t py37 -l 120
BLACK_TARGETS=services/desktop_app/server ai/spectrogram_conversion ai/spectrogram_conversion/utils 
ISORT_CONFIG=--atomic -l 120 --trailing-comma --remove-redundant-aliases --multi-line 3
ISORT_TARGETS=services/desktop_app/server ai/spectrogram_conversion ai/spectrogram_conversion/utils 

format:
	black $(BLACK_CONFIG) $(BLACK_TARGETS)
	isort $(ISORT_CONFIG) $(ISORT_TARGETS)

setup:
	echo 'export METAVOICELIVE_ROOT=${ROOT}' >> ~/.zshrc
	echo 'export PYTHONPATH=${ROOT}:$$PYTHONPATH' >> ~/.zshrc

	echo 'export METAVOICELIVE_ROOT=${ROOT}' >> ~/.bashrc
	echo 'export PYTHONPATH=${ROOT}:$$PYTHONPATH' >> ~/.bashrc

install-cuda:
	pip install -r requirements.cuda.txt
	pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu117

	# if this fails, try via pipwin. Make sure pipwin is within the conda env
	pip install pyaudio

	# munkipkg
	pip install wheels/munkipkg-1.0-py3-none-any.whl
