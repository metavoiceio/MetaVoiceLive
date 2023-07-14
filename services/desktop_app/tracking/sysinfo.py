import locale
import os
from platform import platform
import re
import subprocess
import sys
import time
from collections import namedtuple
import geocoder
import psutil
import platform

from ai.common.sysinfo import get_gpu_cores

try:
    import torch

    TORCH_AVAILABLE = True
except (ImportError, NameError, AttributeError, OSError):
    TORCH_AVAILABLE = False

# System Environment Information
SystemEnv = namedtuple(
    "SystemEnv",
    [
        "cuda_compiled_version",
        "cmake_version",
        "os",
        "libc_version",
        "python_version",
        "python_platform",
        "is_cuda_available",
        "cuda_runtime_version",
        "nvidia_driver_version",
        "nvidia_gpu_models",
        "cudnn_version",
        "hip_compiled_version",
        "hip_runtime_version",
        "miopen_runtime_version",
        "is_xnnpack_available",
        "total_ram_gb",
        "soc_info",
        "timezone",
        "ip",
        "city",
        "country",
    ],
)


def run(command):
    """Returns (return-code, stdout, stderr)"""
    p = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    raw_output, raw_err = p.communicate()
    rc = p.returncode
    if get_platform() == "win32":
        enc = "oem"
    else:
        enc = locale.getpreferredencoding()
    output = raw_output.decode(enc)
    err = raw_err.decode(enc)
    return rc, output.strip(), err.strip()


def run_and_read_all(run_lambda, command):
    """Runs command using run_lambda; reads and returns entire output if rc is 0"""
    rc, out, _ = run_lambda(command)
    if rc != 0:
        return None
    return out


def run_and_parse_first_match(run_lambda, command, regex):
    """Runs command using run_lambda, returns the first regex match if it exists"""
    rc, out, _ = run_lambda(command)
    if rc != 0:
        return None
    match = re.search(regex, out)
    if match is None:
        return None
    return match.group(1)


def run_and_return_first_line(run_lambda, command):
    """Runs command using run_lambda and returns first line if output is not empty"""
    rc, out, _ = run_lambda(command)
    if rc != 0:
        return None
    return out.split("\n")[0]


def get_cmake_version(run_lambda):
    return run_and_parse_first_match(run_lambda, "cmake --version", r"cmake (.*)")


def get_nvidia_driver_version(run_lambda):
    if get_platform() == "darwin":
        cmd = "kextstat | grep -i cuda"
        return run_and_parse_first_match(run_lambda, cmd, r"com[.]nvidia[.]CUDA [(](.*?)[)]")
    smi = get_nvidia_smi()
    return run_and_parse_first_match(run_lambda, smi, r"Driver Version: (.*?) ")


def get_gpu_info(run_lambda):
    if get_platform() == "darwin" or (
        TORCH_AVAILABLE and hasattr(torch.version, "hip") and torch.version.hip is not None
    ):
        if TORCH_AVAILABLE and torch.cuda.is_available():
            return torch.cuda.get_device_name(None)
        return None
    smi = get_nvidia_smi()
    uuid_regex = re.compile(r" \(UUID: .+?\)")
    rc, out, _ = run_lambda(smi + " -L")
    if rc != 0:
        return None
    # Anonymize GPUs by removing their UUID
    return re.sub(uuid_regex, "", out)


def get_running_cuda_version(run_lambda):
    return run_and_parse_first_match(run_lambda, "nvcc --version", r"release .+ V(.*)")


def get_cudnn_version(run_lambda):
    """This will return a list of libcudnn.so; it's hard to tell which one is being used"""
    if get_platform() == "win32":
        system_root = os.environ.get("SYSTEMROOT", "C:\\Windows")
        cuda_path = os.environ.get("CUDA_PATH", "%CUDA_PATH%")
        where_cmd = os.path.join(system_root, "System32", "where")
        cudnn_cmd = '{} /R "{}\\bin" cudnn*.dll'.format(where_cmd, cuda_path)
    elif get_platform() == "darwin":
        # CUDA libraries and drivers can be found in /usr/local/cuda/. See
        # https://docs.nvidia.com/cuda/cuda-installation-guide-mac-os-x/index.html#install
        # https://docs.nvidia.com/deeplearning/sdk/cudnn-install/index.html#installmac
        # Use CUDNN_LIBRARY when cudnn library is installed elsewhere.
        cudnn_cmd = "ls /usr/local/cuda/lib/libcudnn*"
    else:
        cudnn_cmd = 'ldconfig -p | grep libcudnn | rev | cut -d" " -f1 | rev'
    rc, out, _ = run_lambda(cudnn_cmd)
    # find will return 1 if there are permission errors or if not found
    if len(out) == 0 or (rc != 1 and rc != 0):
        l = os.environ.get("CUDNN_LIBRARY")
        if l is not None and os.path.isfile(l):
            return os.path.realpath(l)
        return None
    files_set = set()
    for fn in out.split("\n"):
        fn = os.path.realpath(fn)  # eliminate symbolic links
        if os.path.isfile(fn):
            files_set.add(fn)
    if not files_set:
        return None
    # Alphabetize the result because the order is non-deterministic otherwise
    files = list(sorted(files_set))
    if len(files) == 1:
        return files[0]
    result = "\n".join(files)
    return "Probably one of the following:\n{}".format(result)


def get_nvidia_smi():
    # Note: nvidia-smi is currently available only on Windows and Linux
    smi = "nvidia-smi"
    if get_platform() == "win32":
        system_root = os.environ.get("SYSTEMROOT", "C:\\Windows")
        program_files_root = os.environ.get("PROGRAMFILES", "C:\\Program Files")
        legacy_path = os.path.join(program_files_root, "NVIDIA Corporation", "NVSMI", smi)
        new_path = os.path.join(system_root, "System32", smi)
        smis = [new_path, legacy_path]
        for candidate_smi in smis:
            if os.path.exists(candidate_smi):
                smi = '"{}"'.format(candidate_smi)
                break
    return smi


def get_platform():
    if sys.platform.startswith("linux"):
        return "linux"
    elif sys.platform.startswith("win32"):
        return "win32"
    elif sys.platform.startswith("cygwin"):
        return "cygwin"
    elif sys.platform.startswith("darwin"):
        return "darwin"
    else:
        return sys.platform


def get_mac_version(run_lambda):
    return run_and_parse_first_match(run_lambda, "sw_vers -productVersion", r"(.*)")


def get_windows_version(run_lambda):
    system_root = os.environ.get("SYSTEMROOT", "C:\\Windows")
    wmic_cmd = os.path.join(system_root, "System32", "Wbem", "wmic")
    findstr_cmd = os.path.join(system_root, "System32", "findstr")
    return run_and_read_all(
        run_lambda,
        "{} os get Caption | {} /v Caption".format(wmic_cmd, findstr_cmd),
    )


def get_lsb_version(run_lambda):
    return run_and_parse_first_match(run_lambda, "lsb_release -a", r"Description:\t(.*)")


def check_release_file(run_lambda):
    return run_and_parse_first_match(run_lambda, "cat /etc/*-release", r'PRETTY_NAME="(.*)"')


def get_os(run_lambda):
    from platform import machine

    platform = get_platform()

    if platform == "win32" or platform == "cygwin":
        return get_windows_version(run_lambda)

    if platform == "darwin":
        version = get_mac_version(run_lambda)
        if version is None:
            return None
        return "macOS {} ({})".format(version, machine())

    if platform == "linux":
        # Ubuntu/Debian based
        desc = get_lsb_version(run_lambda)
        if desc is not None:
            return "{} ({})".format(desc, machine())

        # Try reading /etc/*-release
        desc = check_release_file(run_lambda)
        if desc is not None:
            return "{} ({})".format(desc, machine())

        return "{} ({})".format(platform, machine())

    # Unknown platform
    return platform


def get_python_platform():
    import platform

    return platform.platform()


def get_libc_version():
    import platform

    if get_platform() != "linux":
        return "N/A"
    return "-".join(platform.libc_ver())


def is_xnnpack_available():
    if TORCH_AVAILABLE:
        import torch.backends.xnnpack

        return str(torch.backends.xnnpack.enabled)  # type: ignore[attr-defined]
    else:
        return "N/A"


def convert_to_GB(value):
    return round(value / 1024 / 1024 / 1024, 1)


def get_total_ram():
    ram_metrics = psutil.virtual_memory()
    total_GB = convert_to_GB(ram_metrics.total)
    return total_GB


def get_cpu_info():
    cpu_info = os.popen("sysctl -a | grep machdep.cpu").read()
    cpu_info_lines = cpu_info.split("\n")
    data_fields = ["machdep.cpu.brand_string", "machdep.cpu.core_count"]
    cpu_info_dict = {}
    for l in cpu_info_lines:
        for h in data_fields:
            if h in l:
                value = l.split(":")[1].strip()
                cpu_info_dict[h] = value
    return cpu_info_dict


def get_core_counts():
    cores_info = os.popen("sysctl -a | grep hw.perflevel").read()
    cores_info_lines = cores_info.split("\n")
    data_fields = ["hw.perflevel0.logicalcpu", "hw.perflevel1.logicalcpu"]
    cores_info_dict = {}
    for l in cores_info_lines:
        for h in data_fields:
            if h in l:
                value = int(l.split(":")[1].strip())
                cores_info_dict[h] = value
    return cores_info_dict


def get_soc_info():
    cpu_info_dict = get_cpu_info()
    core_counts_dict = get_core_counts()
    try:
        e_core_count = core_counts_dict["hw.perflevel1.logicalcpu"]
        p_core_count = core_counts_dict["hw.perflevel0.logicalcpu"]
    except:
        e_core_count = "?"
        p_core_count = "?"
    soc_info = {
        "name": cpu_info_dict["machdep.cpu.brand_string"],
        "core_count": int(cpu_info_dict["machdep.cpu.core_count"]),
        "cpu_max_power": None,
        "gpu_max_power": None,
        "cpu_max_bw": None,
        "gpu_max_bw": None,
        "e_core_count": e_core_count,
        "p_core_count": p_core_count,
        "gpu_core_count": get_gpu_cores(),
    }
    # TDP (power)
    if soc_info["name"] == "Apple M1 Max":
        soc_info["cpu_max_power"] = 30
        soc_info["gpu_max_power"] = 60
    elif soc_info["name"] == "Apple M1 Pro":
        soc_info["cpu_max_power"] = 30
        soc_info["gpu_max_power"] = 30
    elif soc_info["name"] == "Apple M1":
        soc_info["cpu_max_power"] = 20
        soc_info["gpu_max_power"] = 20
    elif soc_info["name"] == "Apple M1 Ultra":
        soc_info["cpu_max_power"] = 60
        soc_info["gpu_max_power"] = 120
    elif soc_info["name"] == "Apple M2":
        soc_info["cpu_max_power"] = 25
        soc_info["gpu_max_power"] = 15
    else:
        soc_info["cpu_max_power"] = 20
        soc_info["gpu_max_power"] = 20
    # bandwidth
    if soc_info["name"] == "Apple M1 Max":
        soc_info["cpu_max_bw"] = 250
        soc_info["gpu_max_bw"] = 400
    elif soc_info["name"] == "Apple M1 Pro":
        soc_info["cpu_max_bw"] = 200
        soc_info["gpu_max_bw"] = 200
    elif soc_info["name"] == "Apple M1":
        soc_info["cpu_max_bw"] = 70
        soc_info["gpu_max_bw"] = 70
    elif soc_info["name"] == "Apple M1 Ultra":
        soc_info["cpu_max_bw"] = 500
        soc_info["gpu_max_bw"] = 800
    elif soc_info["name"] == "Apple M2":
        soc_info["cpu_max_bw"] = 100
        soc_info["gpu_max_bw"] = 100
    else:
        soc_info["cpu_max_bw"] = 70
        soc_info["gpu_max_bw"] = 70
    # TODO: how do we keep the above updated as apple releases new hardware??
    return soc_info


def get_env_info():
    run_lambda = run

    if TORCH_AVAILABLE:
        cuda_available_str = str(torch.cuda.is_available())
        cuda_version_str = torch.version.cuda
        if not hasattr(torch.version, "hip") or torch.version.hip is None:  # cuda version
            hip_compiled_version = hip_runtime_version = miopen_runtime_version = "N/A"
        else:  # HIP version
            cfg = torch._C._show_config().split("\n")
            hip_runtime_version = [s.rsplit(None, 1)[-1] for s in cfg if "HIP Runtime" in s][0]
            miopen_runtime_version = [s.rsplit(None, 1)[-1] for s in cfg if "MIOpen" in s][0]
            cuda_version_str = "N/A"
            hip_compiled_version = torch.version.hip
    else:
        cuda_available_str = cuda_version_str = "N/A"
        hip_compiled_version = hip_runtime_version = miopen_runtime_version = "N/A"

    sys_version = sys.version.replace("\n", " ")

    me_ip = geocoder.ip("me")
    ip, city, country = (
        me_ip.ip,
        me_ip.city,
        me_ip.country,
    )  # TODO: confirm/improve accuracy

    os = get_os(run_lambda)

    return SystemEnv(
        python_version="{} ({}-bit runtime)".format(sys_version, sys.maxsize.bit_length() + 1),
        python_platform=get_python_platform(),
        is_cuda_available=cuda_available_str,
        cuda_compiled_version=cuda_version_str,
        cuda_runtime_version=get_running_cuda_version(run_lambda),
        nvidia_gpu_models=get_gpu_info(run_lambda),
        nvidia_driver_version=get_nvidia_driver_version(run_lambda),
        cudnn_version=get_cudnn_version(run_lambda),
        hip_compiled_version=hip_compiled_version,
        hip_runtime_version=hip_runtime_version,
        miopen_runtime_version=miopen_runtime_version,
        os=os,
        libc_version=get_libc_version(),
        cmake_version=get_cmake_version(run_lambda),
        is_xnnpack_available=is_xnnpack_available(),
        total_ram_gb=get_total_ram(),
        soc_info=get_soc_info() if "Windows" not in os else {'name': platform.processor()},
        timezone=time.tzname,
        ip=ip,
        city=city,
        country=country,
    )._asdict()


if __name__ == "__main__":
    print(get_env_info())
