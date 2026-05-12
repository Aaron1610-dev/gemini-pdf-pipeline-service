import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Review UI render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="errorBoundary">
          <h1>Ứng dụng gặp lỗi khi hiển thị</h1>
          <p>Vui lòng kiểm tra console trình duyệt hoặc build log để xem chi tiết.</p>
          <pre>{this.state.error?.message || String(this.state.error)}</pre>
        </main>
      );
    }

    return this.props.children;
  }
}
