import os


def get_gpu_cores():
    try:
        cores = os.popen("system_profiler -detailLevel basic SPDisplaysDataType | grep 'Total Number of Cores'").read()
        cores = int(cores.split(": ")[-1])
    except:
        cores = "?"
    return cores
