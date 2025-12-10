"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

const MY_PORTAL_URL = process.env.NEXT_PUBLIC_MY_PORTAL_URL || "https://portal.specialrisk.me";

const loginSchema = z.object({
  email: z.string().email("유효한 이메일을 입력해주세요."),
  password: z.string().min(1, "비밀번호를 입력해주세요."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isSSOLoading, setIsSSOLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // SSO 토큰 처리
  useEffect(() => {
    const ssoToken = searchParams.get("sso_token");
    console.log("[SSO] Token from URL:", ssoToken ? `${ssoToken.substring(0, 20)}...` : "none");
    if (ssoToken) {
      handleSSOLogin(ssoToken);
    }
  }, [searchParams]);

  async function handleSSOLogin(token: string) {
    console.log("[SSO] Starting SSO login...");
    setIsSSOLoading(true);
    try {
      const result = await signIn("credentials", {
        ssoToken: token,
        redirect: false,
      });

      console.log("[SSO] SignIn result:", result);

      // URL에서 sso_token 제거
      const url = new URL(window.location.href);
      url.searchParams.delete("sso_token");
      window.history.replaceState({}, document.title, url.pathname);

      if (result?.error) {
        console.log("[SSO] Error:", result.error);
        toast.error(result.error);
      } else {
        console.log("[SSO] Success!");
        toast.success("SSO 로그인 성공!");
        // router.push + refresh 대신 window.location으로 전체 페이지 새로고침
        window.location.href = "/";
      }
    } catch (err) {
      console.error("[SSO] Exception:", err);
      toast.error("SSO 로그인 중 오류가 발생했습니다.");
    } finally {
      setIsSSOLoading(false);
    }
  }

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("로그인되었습니다.");
        router.push("/");
        router.refresh();
      }
    } catch {
      toast.error("로그인 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">로그인</CardTitle>
        <CardDescription className="text-center">
          RetireFarm Manager에 로그인하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비밀번호</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="********"
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading || isSSOLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              로그인
            </Button>
          </form>
        </Form>

        {/* SSO 로그인 섹션 */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">또는</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          disabled={isLoading || isSSOLoading}
          onClick={() => window.location.href = MY_PORTAL_URL}
        >
          {isSSOLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" />
          )}
          My Portal로 로그인
        </Button>

        <p className="text-xs text-center text-muted-foreground mt-3">
          My Portal에 로그인 후 RetireFarm 카드를 클릭하면 자동 로그인됩니다.
        </p>
      </CardContent>
      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <Link href="/auth/register" className="text-primary hover:underline">
            회원가입
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    }>
      <LoginForm />
    </Suspense>
  );
}
