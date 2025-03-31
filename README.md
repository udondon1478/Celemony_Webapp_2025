**後任者の方へ**
現時点(2025-04-01)で後任者に向けたまともな手順書は作成できていません。卒業までには作る予定ですが、本年度のプロジェクトは私個人のリソースで負担している面が多く、このリポジトリをクローンしただけでは全てが動作するわけではありません。このような構成になってしまい申し訳ないですが、少なくとも2025年度と全く同じ構成で本アプリを動かしたい場合、大量の通信をさばけるだけの帯域を有しているサーバーが必要です。

本年度は私の有しているサーバー上にリバースプロキシを構築し、その内部でLINEから飛んでくるWebhookを処理するPythonのプログラムとフロントエンドを表示するReactが動作していました。そのため、SSL化に必要な証明書やアクセスを容易にするためのドメインまで全て私が所有しているものを使用しました。
上記の理由から、本リポジトリはクローンを行うだけで正しく機能するわけではないと考えてください。