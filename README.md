# MetaVoice Live


[![](https://dcbadge.vercel.app/api/server/Cpy6U3na8Z?style=flat&compact=True)](https://discord.gg/Cpy6U3na8Z)
[![Twitter](https://img.shields.io/twitter/url/https/twitter.com/OnusFM.svg?style=social&label=@TheMetaVoice)](https://twitter.com/TheMetavoice)
<a href="http://www.repostatus.org/#active"><img src="http://www.repostatus.org/badges/latest/active.svg" /></a>

> 🔗  • [Getting started](#-getting-started) • [Installation](https://discord.com/channels/902229215993282581/1133486389661536297) • [Tips, Tricks & FAQ](https://bit.ly/metavoice-faqs)

<br/>
<p align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./public/dark_mode.png">
        <img alt="logo banner" src="./public/light_mode.png" width="600" />
    </picture>
</p>
<br/>


Welcome to **MetaVoice Live, our real-time AI voice changer**! Live converts your voice while preserving your intonations, emotions, and accent. 


We are open-sourcing our code to give the community the freedom to make their own improvements. This repository contains source code for:
- Our ML model inference on Windows & Nvidia GPUs, and,
- User-facing desktop app


## 💻 Getting started

> Please use Windows as the development environment. We recommend using [Cmder](https://cmder.app/) as the terminal of choice.

1. Run `conda create -n mvc python=3.10 -c conda-forge` and `conda activate mvc`
2. Copy `Makefile.variable.sample`, rename to `Makefile.variable` & update the vars with their appropriate value. Make sure the site-packages directory exists, or adjust it.
3. Run `make setup`
4. Run `make install-cuda`
5. Add the windows env variable `set METAVOICELIVE_ROOT=%cd%`

(Optional) You might also want to copy `.env.sample` into `.env` and fill those values if you can.

### 📖 Repo structure
* `ai/` -> ML model weights & inferencing pipeline
* `services/desktop_app` -> electron application, see its README.md


## 🛠️ Get involved

We welcome PRs & issues. If you have questions, please mention @sidroopdaska or @towc

Some ideas for first PRs:
- Port `inference_rt.py` -> C++
- Streamline the Electron app build & release process
- Add support to package Live for Mac

🙏 If you come across something sensitive, e.g. vulnerabilities or access keys, please let us know privately on 📧 [hello@themetavoice.xyz](mailto:hello@themetavoice.xyz) first & give us 2 weeks to resolve it.


## 🤗 Community

- [Twitter](https://twitter.com/themetavoice)
- [Discord](https://discord.gg/Cpy6U3na8Z)


## © License

MetaVoice Live is licensed under X.

Please contact us at 📧 [hello@themetavoice.xyz](mailto:hello@themetavoice.xyz) to request access to a larger version of the model.  

## ⚠️ Disclaimer

MetaVoice does not take responsibility for any output generated. Please use responsibly.
