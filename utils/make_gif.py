from PIL import Image
import argparse


def prepare_frame(img, size):
    """
    保留透明背景，并转换为适合 GIF 的格式
    """
    img = img.convert("RGBA").resize(size, Image.LANCZOS)

    # GIF 不支持完整 alpha，只能用一个透明索引
    alpha = img.getchannel("A")

    # 转成 P 模式
    paletted = img.convert("P", palette=Image.ADAPTIVE)

    # 使用 255 作为透明色索引
    transparency_index = 255

    # alpha 很低的地方视为透明
    mask = alpha.point(lambda p: 255 if p <= 10 else 0)
    paletted.paste(transparency_index, mask)

    return paletted, transparency_index


def make_timed_gif(
    image1_path,
    image2_path,
    output_path,
    image1_duration=4800,
    image2_duration=200,
    loop=0,
):
    """
    将两张图片合成为 GIF，并控制每张图显示多久。

    参数：
    image1_duration: 第一张图显示时长，单位 ms
    image2_duration: 第二张图显示时长，单位 ms
    loop: 0 表示无限循环
    """

    img1 = Image.open(image1_path).convert("RGBA")
    img2 = Image.open(image2_path).convert("RGBA")

    size = img1.size

    frame1, transparency_index = prepare_frame(img1, size)
    frame2, _ = prepare_frame(img2, size)

    frames = [frame1, frame2]

    durations = [
        image1_duration,
        image2_duration,
    ]

    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=loop,
        transparency=transparency_index,
        disposal=2,
        optimize=False,
    )

    print(f"GIF 已生成：{output_path}")
    print(f"图1显示：{image1_duration} ms")
    print(f"图2显示：{image2_duration} ms")
    print(f"完整循环：{image1_duration + image2_duration} ms")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="按显示时长合成两张图片 GIF")

    parser.add_argument("image1", help="第一张图片路径")
    parser.add_argument("image2", help="第二张图片路径")
    parser.add_argument("output", help="输出 GIF 路径")

    parser.add_argument(
        "--duration1",
        type=int,
        default=4800,
        help="第一张图显示时长，单位 ms",
    )

    parser.add_argument(
        "--duration2",
        type=int,
        default=200,
        help="第二张图显示时长，单位 ms",
    )

    parser.add_argument(
        "--loop",
        type=int,
        default=0,
        help="循环次数，0 表示无限循环",
    )

    args = parser.parse_args()

    make_timed_gif(
        args.image1,
        args.image2,
        args.output,
        image1_duration=args.duration1,
        image2_duration=args.duration2,
        loop=args.loop,
    )