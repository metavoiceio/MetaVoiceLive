include ${METAVOICELIVE_ROOT}/Makefile.variable

clean-server:
	rm -rf dist/ pyinstallerbuild/

build-server-windows: clean-server
	# NOTE: for Librosa, PyInstaller tries to find all the dependencies, however this folder is not imported but loaded so it misses it.
	# We include it in the application bundle through --add-data
	# TODO sidroopdaska: remove copying over model once lazy loading has been implemented
	pyinstaller -D -n metavoice --workpath pyinstallerbuild \
		-p ${METAVOICELIVE_ROOT} \
		--add-data="${SITE_PACKAGES}/librosa/util/example_data;librosa/util/example_data" \
		--add-data="${SITE_PACKAGES}/_soundfile_data;_soundfile_data" \
		--add-data="${METAVOICELIVE_ROOT}/ai;ai" \
		server/main.py

	rm -rf dist/metavoice/ai/spectrogram_conversion/saved_models
	rm -rf dist/metavoice/ai/spectrogram_conversion/originals

	echo local > dist/metavoice/version.txt

deploy-server:
	python deploy_ml.py